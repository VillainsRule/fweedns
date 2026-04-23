import fs from 'node:fs';
import path from 'node:path';

import accountDB from '../db/AccountDB';
import domainDB from '../db/DomainDB';

import solve from '../captcha';

const words = fs.readFileSync(path.join(import.meta.dirname, '..', '4l.txt'), 'utf-8')
    .split('\n').map((w) => w.trim()).filter(Boolean);

const logDir = path.join(import.meta.dirname, '..', '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const orange = (text: string) => `\x1b[38;5;208m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;

const addSubdomain = async (ip: string, logPath: string) => {
    try {
        const account = accountDB.getRandomQualifiedAccount();
        if (!account) return console.error('no qualified accounts available, gen more');

        const domain = domainDB.getRandomDomain();
        if (!domain) return console.error('no domains available, run the scraper?');

        const captchaReq = await fetch('https://freedns.afraid.org/securimage/securimage_show.php', { proxy: Bun.env.PROXY });
        if (captchaReq.headers.get('content-type') !== 'image/png') {
            const text = await captchaReq.text();
            if (text.includes('Unable to determine IP address from host name <q>freedns.afraid.org</q>')) return;
            return console.log('captcha request failed, response was not an image', text);
        }

        const captchaBuffer = await captchaReq.arrayBuffer();
        const captchaSolution = await solve(captchaBuffer);

        const subdomain = words[Math.floor(Math.random() * words.length)] + (Math.floor(Math.random() * 9) + 1);

        const req = await fetch('https://freedns.afraid.org/subdomain/save.php?step=2', {
            method: 'POST',
            proxy: Bun.env.PROXY,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': account.cookie + '; ' + captchaReq.headers.get('set-cookie')!.split(';')[0]
            },
            body: new URLSearchParams({
                type: 'A',
                subdomain,
                domain_id: domain.id,
                address: ip,
                ttlalias: 'For our premium supporters',
                captcha_code: captchaSolution,
                ref: 'L3N1YmRvbWFpbi8=',
                send: 'Save!'
            })
        });

        const text = await req.text() as string;

        if (text.includes('The security code was incorrect, please try again.')) {
            console.log(red('- captcha failed, wtf.'));
        } else if (text.includes('You have no more subdomain capacity allocated.') || text.includes('<TITLE>Premium memberships</TITLE>')) {
            console.log(red('- account has no more capacity, skipping'));
            accountDB.maxOutNow(account.email);
        } else if (text.includes('Remember Me!</font>')) {
            console.log(yellow('> account is not logged in, skipping: ' + account.email));
        } else if (text.includes('Locked Account')) {
            console.log(orange('* account is LOCKED. boo. josh spoil sport. ' + account.email));
            accountDB.delete(account.email);
        } else if (text.includes('Invalid UserID/Pass')) {
            console.log(orange('* account was DELETED. boo. josh spoil sport. ' + account.email));
            accountDB.delete(account.email);
        } else if (text.includes('ERROR: The requested URL could not be retrieved')) {
            console.log(red('- freedns\'s server failed to respond'));
        } else if (text.includes('<TITLE>Subdomains</TITLE>')) {
            console.log(green(`+ ${subdomain}.${domain.domain}`));
            accountDB.incrementDomains(account.email);
            fs.appendFileSync(logPath, `https://${subdomain}.${domain.domain}\n`, 'utf-8');
        } else {
            process.getBuiltinModule('fs').writeFileSync('error.html', text);
            console.log(yellow('---------> unknown response, check error.html'));
        }
    } catch (e: any) {
        if (e.message.toString().includes('The socket connection was closed unexpectedly')) return;

        console.error('error creating account:', e);
    }
}

const addSubdomains = (ip: string) => {
    const logPath = path.join(logDir, ip + '.log');
    if (fs.existsSync(logPath)) fs.appendFileSync(logPath, '\n', 'utf-8');
    fs.appendFileSync(logPath, `--> [${new Date().toISOString()}] ${ip}\n`, 'utf-8');

    setInterval(() => addSubdomain(ip, logPath), 50);
}

export default addSubdomains;