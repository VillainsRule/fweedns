import accountDB, { type Account } from '../db/AccountDB';

const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;

const getRandomTimeout = () => 1000 + Math.random() * 9000;

let lockedCount = 0;
let unlockedCount = 0;
let failedCount = 0;
let loginFailedCount = 0;

const checkAccount = async (account: Account, doDelete: boolean, retries = 0): Promise<void> => {
    if (retries >= 3) {
        failedCount++;
        console.log(red(`max retries reached: ${account.email}`));
        return;
    }
    if (retries > 0) console.log(yellow(`retrying (${retries}/3): ${account.email}`));

    try {
        const req = await fetch('https://freedns.afraid.org/zc.php?step=2', {
            method: 'POST',
            proxy: Bun.env.PROXY,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                'username': account.email,
                'password': account.password,
                'submit': 'Login',
                'remote': '',
                'from': 'L2RvbWFpbi8=',
                'action': 'auth'
            }),
            redirect: 'manual'
        });

        if (req.headers.get('location') === 'http://freedns.afraid.org/domain/?ls=1') {
            const dnsCookie = req.headers.getSetCookie().find(e => e.startsWith('dns_cookie='));
            if (!dnsCookie) {
                console.log(red(`missing cookie: ${account.email}${doDelete ? ', deleting...' : ''}`));
                if (doDelete) accountDB.delete(account.email);
                failedCount++;
                return;
            }

            const domainReq = await fetch('https://freedns.afraid.org/subdomain/', {
                headers: { cookie: dnsCookie },
                proxy: Bun.env.PROXY
            });

            const domainText = await domainReq.text();
            if (domainText.includes('<TITLE>Locked Account</TITLE>')) {
                lockedCount++;
                console.log(red(`account locked: ${account.email}${doDelete ? ', deleting...' : ''}`));
                if (doDelete) accountDB.delete(account.email);
            } else if (domainText.includes('Add a subdomain') || domainText.includes('delete selected') || domainText.includes('<TITLE>Premium memberships</TITLE>')) {
                unlockedCount++;
                console.log(green(`account good: ${account.email}`));
            } else if (domainReq.status.toString().startsWith('5')) {
                await new Promise(resolve => setTimeout(resolve, getRandomTimeout()));
                return checkAccount(account, doDelete, retries + 1);
            } else {
                failedCount++;
                console.log(red(`unexpected subdomain response for ${account.email} (status ${domainReq.status})`));
            }
        } else if (req.status.toString().startsWith('5')) {
            await new Promise(resolve => setTimeout(resolve, getRandomTimeout()));
            return checkAccount(account, doDelete, retries + 1);
        } else {
            const text = await req.text();
            if (text.includes('Invalid UserID/Pass')) {
                loginFailedCount++;
                console.log(red(`login failed: ${account.email}`));
            } else {
                await new Promise(resolve => setTimeout(resolve, getRandomTimeout()));
                return checkAccount(account, doDelete, retries + 1);
            }
        }
    } catch (e: any) {
        if (e.message.toString().includes('The socket connection was closed unexpectedly')) return checkAccount(account, doDelete, retries + 1);
        failedCount++;
        console.error('error checking account:', e);
    }
}

export default async (doDelete: boolean) => {
    lockedCount = 0;
    unlockedCount = 0;
    failedCount = 0;
    loginFailedCount = 0;

    const rndAccounts = accountDB.accounts.sort(() => Math.random() - 0.5);

    console.log(yellow(`checking ${rndAccounts.length} accounts (estimated to take ${Math.round(20 * rndAccounts.length / 60000)} minutes)...`));

    setInterval(() => {
        console.log('');
        console.log(blue(`progress update: checked ${unlockedCount + lockedCount + loginFailedCount + failedCount}/${rndAccounts.length} accounts so far...`));
        console.log(green(`unlocked accounts: ${unlockedCount}`));
        console.log(red(`locked accounts: ${lockedCount}`));
        console.log(red(`login failed: ${loginFailedCount}`));
        console.log(yellow(`failed/skipped: ${failedCount}`));
        console.log('');
    }, 30_000).unref();

    const promises = [];
    for (let i = 0; i < rndAccounts.length; i++) {
        const account = rndAccounts[i];
        promises.push(checkAccount(account, doDelete));
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    await Promise.allSettled(promises);

    console.log(green(`unlocked accounts: ${unlockedCount}`));
    console.log(red(`locked accounts: ${lockedCount}`));
    console.log(red(`login failed: ${loginFailedCount}`));
    console.log(yellow(`failed/skipped: ${failedCount}`));
}
