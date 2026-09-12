import path from 'node:path'

import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

const solve = async (imagePath: string) => {
    const session = await ort.InferenceSession.create(path.join(import.meta.dirname, 'crnn.onnx'))

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
            if (v > maxVal) {
                maxVal = v
                maxIdx = c
            }
        }
        preds.push(maxIdx)
    }

    const result: string[] = []
    let prev: number | null = null

    for (const i of preds) {
        if (i === 27) {
            prev = null
            continue
        }

        if (i !== prev) result.push(String.fromCharCode(65 + i))

        prev = i
    }

    return result.join('')
}

const result = await solve(process.argv[2])
console.log(result)