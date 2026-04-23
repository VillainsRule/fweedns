import fs from 'node:fs';
import path from 'node:path';

import accountDB from '../db/AccountDB';

import solve from '../captcha';

const blockedDomains = ['netmon.ir'];

const bannedRegisDir = path.join(import.meta.dirname, '..', '..', 'bannedRegis');
if (!fs.existsSync(bannedRegisDir)) fs.mkdirSync(bannedRegisDir, { recursive: true });

const failedCapDir = path.join(import.meta.dirname, '..', '..', 'failedCaps');
if (!fs.existsSync(failedCapDir)) fs.mkdirSync(failedCapDir, { recursive: true });

const isSavingBadCaps = false;

const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const orange = (text: string) => `\x1b[38;5;208m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;

let correctCaptchas = 0;
let incorrectCaptchas = 0;

const createAccount = async () => {
    try {
        const username = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
        const password = crypto.randomUUID().replaceAll('-', '').slice(0, 16);

        const addressReq = await fetch('https://malq.villainsrule.xyz/api/v1/session');
        const addressRes = await addressReq.json() as { address: string | undefined, token: string, provider: string };

        if (!addressRes.address) return console.error(`failed to get an address from ${addressRes.provider}`);
        if (blockedDomains.some(d => addressRes.address?.endsWith('@' + d))) return console.log(`skipping blocked domain ${addressRes.provider}`);

        const captchaReq = await fetch('https://freedns.afraid.org/securimage/securimage_show.php', { proxy: Bun.env.PROXY });
        if (captchaReq.headers.get('content-type') !== 'image/png') {
            const text = await captchaReq.text();
            if (text.includes('Unable to determine IP address from host name <q>freedns.afraid.org</q>')) return console.error('freedns server failed on the captchaReq');

            return console.log('captcha request failed, response was not an image', text);
        }

        const captchaBuffer = await captchaReq.arrayBuffer();
        const captchaSolution = await solve(captchaBuffer);

        const captchaSession = captchaReq.headers.get('set-cookie')?.split(';')[0];
        if (!captchaSession) return console.error('failed to get PHPSESSID from captcha response');

        const signupReq = await fetch('https://freedns.afraid.org/signup/?step=2', {
            method: 'POST',
            proxy: Bun.env.PROXY,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': captchaSession
            },
            body: new URLSearchParams({
                'plan': 'starter',
                'firstname': username,
                'lastname': username,
                'username': username,
                'password': password,
                'password2': password,
                'email': addressRes.address,
                'captcha_code': captchaSolution,
                'tos': '1',
                'affirm': '1',
                'PROCID': '',
                'TRANSPRE': '',
                'action': 'signup',
                'send': 'Send activation email'
            }),
            redirect: 'manual'
        });

        const signupRes = await signupReq.text();
        if (signupReq.status !== 302) {
            if (signupRes.includes('<h2>The requested URL could not be retrieved</h2>')) return console.error('freedns server failed on the signupReq');

            if (signupRes.includes('The security code was incorrect, please try again')) {
                incorrectCaptchas++;
                if (isSavingBadCaps) fs.writeFileSync(path.join(failedCapDir, `${captchaSolution}.png`), Buffer.from(captchaBuffer));
                return console.log(red('captcha failed, wtf.'));
            }

            if (signupRes.includes('We\'re not able to accept this registration at this time')) {
                const proxyIP = await fetch('https://myip.wtf/json', { proxy: Bun.env.PROXY }).then(r => r.json()) as any;
                fs.writeFileSync(path.join(bannedRegisDir, `${Date.now()}.txt`), `IP data:\n${JSON.stringify(proxyIP, null, 4)}\n\nProvider: ${addressRes.provider}\nEmail: ${addressRes.address}`);
                return console.log(red('signup blocked? odd.'));
            }

            console.error('signup request failed', addressRes.provider, signupReq.status, signupRes);
            fs.writeFileSync(path.join(import.meta.dirname, 'signup_error.html'), signupRes);
            return;
        }

        correctCaptchas++;

        let hasEmail = false;
        let dnsCookie = '';

        while (!hasEmail) {
            const emailReq = await fetch(`https://malq.villainsrule.xyz/api/v1/inbox/${addressRes.token}`);
            const emailRaw = await emailReq.text() as string;
            if (!emailRaw.startsWith('{')) {
                if (emailRaw.includes('502: bad gateway')) {
                    console.log(red('malq crashed and will be back soon'));
                    break;
                }

                console.log(red('provider tweaking, inbox response isnt json'), addressRes.provider, emailRaw);
                break;
            }

            const emailRes = JSON.parse(emailRaw) as { mail: { id: string, from: string, subject: string, body: string }[] } | { error: string };

            if ('error' in emailRes) {
                if (emailRes.error === 'invalid session token') {
                    console.log(red('provider never got the mail'), addressRes.provider);
                    break;
                }

                console.log(red('provider tweaking, email list error'), addressRes.provider, emailRes.error);
                break;
            }

            const activationEmail = emailRes.mail.find(e => e.subject.includes('Welcome new member!'));
            if (!activationEmail) {
                await new Promise(res => setTimeout(res, 2000));
                continue;
            }

            if (!activationEmail.body) {
                console.error('email body is empty', addressRes.provider);
                break;
            }

            hasEmail = true;

            const activationLinkMatch = activationEmail.body.match(/(http:\/\/freedns.afraid.org\/signup\/activate.php\?[A-z0-9]+)/);
            const activationLink = activationLinkMatch ? activationLinkMatch[0] : null;
            if (!activationLink) {
                console.error('failed to find activation link in email body', addressRes.provider, activationEmail.body);
                continue;
            }

            const activationReq = await fetch(activationLink, { proxy: Bun.env.PROXY, redirect: 'manual', headers: { 'Cookie': captchaSession } });
            if (activationReq.status !== 302) {
                console.error('account activation failed');
                fs.writeFileSync(path.join(import.meta.dirname, 'activation_error.html'), await activationReq.text());
                continue;
            }

            const activationRedirect1 = activationReq.headers.get('location');
            if (!activationRedirect1) {
                console.error('failed to get redirect after activation', activationReq.headers);
                continue;
            }

            const cookieReq = await fetch('https://freedns.afraid.org' + activationRedirect1, { proxy: Bun.env.PROXY, redirect: 'manual', headers: { 'Cookie': captchaSession } });
            const cookie = cookieReq.headers.getSetCookie().find(e => e.startsWith('dns_cookie='))?.split(';')[0];
            if (!cookie) {
                const text = await cookieReq.text();
                if (text.includes('<h2>The requested URL could not be retrieved</h2>')) {
                    console.error('freedns server failed on the cookieReq');
                    break;
                }

                console.error('failed to get cookie after activation');
                fs.writeFileSync(path.join(import.meta.dirname, 'cookie_error.html'), text);
                break;
            }

            dnsCookie = cookie;
        }

        if (hasEmail && dnsCookie) {
            accountDB.addAccount(addressRes.address, password, dnsCookie);
            console.log(green(`-> created account ${addressRes.address}:${password}`));
        }
    } catch (e) {
        console.error('error creating account:', e);
    }
}

// go under 200 and i'll GENUINELY ban you from malq
setInterval(createAccount, 200);

setInterval(() => {
    const total = correctCaptchas + incorrectCaptchas;
    const pct = total === 0 ? 0 : (correctCaptchas / total * 100);
    console.log(`${orange('>>>')} ${yellow('correct captchas %:')} ${orange(pct.toFixed(2) + '%')}`);
}, 10000);