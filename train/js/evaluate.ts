import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const BLANK = 27

const decode = (preds: number[]) => {
    const result: string[] = []
    let prev: number | null = null
    for (const i of preds) {
        if (i === BLANK) { prev = null; continue }
        if (i !== prev) result.push(String.fromCharCode(65 + i))
        prev = i
    }
    return result.join('')
}

const loadSamples = (capsDir: string) => {
    const samples: [string, string][] = []
    for (const fname of fs.readdirSync(capsDir)) {
        if (!fname.toLowerCase().endsWith('.png')) continue
        const label = path.basename(fname, '.png').toUpperCase()
        if (![...label].every(c => CHARSET.includes(c))) continue
        samples.push([path.join(capsDir, fname), label])
    }
    return samples
}

const solve = async (session: ort.InferenceSession, imagePath: string) => {
    const { data } = await sharp(imagePath)
        .grayscale()
        .resize(200, 64, { kernel: 'linear' })
        .raw()
        .toBuffer({ resolveWithObject: true })

    const float32 = new Float32Array(data.length)
    for (let i = 0; i < data.length; i++) float32[i] = (data[i] / 255 - 0.5) / 0.5

    const tensor = new ort.Tensor('float32', float32, [1, 1, 64, 200])
    const { output } = await session.run({ input: tensor })

    const [, seq, numClasses] = output.dims
    const preds: number[] = []
    for (let t = 0; t < seq; t++) {
        let maxVal = -Infinity, maxIdx = 0
        for (let c = 0; c < numClasses; c++) {
            const v = output.data[t * numClasses + c] as number
            if (v > maxVal) { maxVal = v; maxIdx = c }
        }
        preds.push(maxIdx)
    }

    return decode(preds)
}

const capsDir = process.argv[2] ?? '../caps'
const samples = loadSamples(capsDir)
const session = await ort.InferenceSession.create('crnn.onnx')

let correct = 0
const wrong: { filename: string, expected: string, predicted: string }[] = []

for (const [imgPath, expected] of samples) {
    try {
        const predicted = await solve(session, imgPath)
        if (predicted === expected) {
            correct++
        } else {
            wrong.push({ filename: path.basename(imgPath), expected, predicted })
        }
    } catch (e) {
        process.stderr.write(`error processing ${imgPath}: ${e}\n`)
    }
}

const total = samples.length
const accuracy = total > 0 ? (correct / total * 100) : 0

console.log(`\naccuracy: ${correct}/${total} (${accuracy.toFixed(2)}%)`)
console.log('\nwrong predictions:')

wrong.sort((a, b) => a.filename.localeCompare(b.filename))
for (const r of wrong)
    console.log(`${r.filename} | expected: ${r.expected} | got: ${r.predicted}`)