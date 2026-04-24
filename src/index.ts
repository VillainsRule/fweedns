import Enquirer from 'enquirer'
import accountDB from './db/AccountDB';
import domainDB from './db/DomainDB';

const e = new Enquirer()

const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;

e.on('cancel', () => process.exit(0))

const { action } = await e.prompt({
    type: 'autocomplete',
    name: 'action',
    message: 'whatcha wanna do?',
    choices: [
        { name: 'stats', message: 'view statistics' },
        { name: 'createAccounts', message: 'create accounts' },
        { name: 'scrapeDomains', message: 'scrape domains' },
        { name: 'addSubdomains', message: 'add subdomains' },
        { name: 'checkAccounts', message: 'check accounts' }
    ]
}) as { action: 'stats' | 'createAccounts' | 'scrapeDomains' | 'addSubdomains' | 'checkAccounts' }

if (action === 'stats') {
    console.log('');
    console.log(`   ${yellow('accounts:')} ${accountDB.accounts.length}`);
    console.log(`   ${yellow('domains:')} ${domainDB.getDomains().length}`);
    console.log(`   ${yellow('add space:')} ${accountDB.accounts.reduce((sum, acc) => sum + (5 - acc.domains), 0)}`);
    console.log('');
}

if (action === 'createAccounts') await import('./actions/createAccounts');
if (action === 'scrapeDomains') await import('./actions/grabDomains');

if (action === 'addSubdomains') {
    const { ip } = await e.prompt({
        type: 'input',
        name: 'ip',
        message: 'what ip you wanna point the subdomains to?',
        initial: Bun.env.AUTOADD_IP || undefined
    }) as { ip: string }

    await import('./actions/addSubdomains').then(module => module.default(ip));
}

if (action === 'checkAccounts') {
    const doDelete = await e.prompt({
        type: 'confirm',
        name: 'doDelete',
        message: 'delete accounts that are locked?',
        initial: true
    }) as { doDelete: boolean }

    await import('./actions/checkAccounts').then(module => module.default(doDelete.doDelete));
}