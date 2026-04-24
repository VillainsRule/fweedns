import fs from 'node:fs'
import path from 'node:path'

const dbDir = path.join(import.meta.dirname, 'v1')
const accountPath = path.join(dbDir, 'accounts.json')

export interface Account {
    email: string
    password: string
    cookie: string
    domains: number
}

class AccountDB {
    accounts: Account[] = []

    constructor() {
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
        if (!fs.existsSync(accountPath)) fs.writeFileSync(accountPath, '[]', 'utf-8')

        const data = fs.readFileSync(accountPath, 'utf-8')
        this.accounts = JSON.parse(data) as Account[];

        this.cleanup();

        const updateAccounts = () => fs.writeFileSync(accountPath, JSON.stringify(this.accounts, null, 2), 'utf-8');

        setInterval(() => updateAccounts(), 10_000).unref();
        process.on('exit', () => updateAccounts())
        process.on('SIGINT', () => (updateAccounts(), process.exit(0)));
        process.on('SIGTERM', () => (updateAccounts(), process.exit(0)));
    }

    addAccount(email: string, password: string, cookie: string): void {
        this.accounts.push({ email, password, cookie, domains: 0 })
    }

    updateCookie(email: string, cookie: string): void {
        const account = this.accounts.find(acc => acc.email === email)
        if (account) account.cookie = cookie
        else console.error(`[updateCookie] account "${email}" not found`)
    }

    incrementDomains(email: string): void {
        const account = this.accounts.find(acc => acc.email === email)
        if (account) account.domains++
        else console.error(`[incrementDomains] account "${email}" not found`)
    }

    maxOutNow(email: string) {
        const account = this.accounts.find(acc => acc.email === email)
        if (account) account.domains = 5
        else console.error(`[maxOutNow] account "${email}" not found`)
    }

    getRandomQualifiedAccount(): Account | null {
        const qualifiedAccounts = this.accounts.filter(acc => acc.domains < 5);
        return qualifiedAccounts[qualifiedAccounts.length * Math.random() | 0] || null;
    }

    delete(email: string): void {
        const filteredAccounts = this.accounts.filter(acc => acc.email !== email)
        if (this.accounts.length === filteredAccounts.length) console.error(`[remove] account "${email}" not found`)
        else this.accounts = filteredAccounts;
    }

    cleanup() {
        this.accounts = this.accounts.filter(acc => acc.cookie);
    }
}

const accountDB = new AccountDB()
export default accountDB