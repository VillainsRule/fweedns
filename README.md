<div align='center'>
    <h1>fweedns</h1>
    <h3>silly mass automation of freedns</h3>
</div>

<br><br>
<h2 align='center'>usage</h2>

1. `git clone https://github.com/VillainsRule/fweedns && cd fweedns`
2. `bun install` (bun required for `proxy` option)
3. `cp .env.example .env && nano .env` 
3. `bun .`

<br><br>
<h2 align='center'>the pipeline</h2>

you should probably run actions in this order:

1. create accounts
2. grab domains
3. add subdomains
4. check your stats!

running any of these at the same time tends to corrupt the DB.

<br><br>
<h2 align='center'>captchas</h2>

the captcha solver is bundled as a released onnx file; i have no interest in releasing the trainer or dataset at the moment. it solves at a roughly 87% success rate, which will hopefully be improved over time.

<br><br>
<h2 align='center'>account creation</h2>

this uses [malq](https://malq.villainsrule.xyz) under the hood to create email-verified accounts. malq does not have any authentication, and i'd like to keep it that way. if you spam malq too hard, your IP will be permanntly banned.

<br><br>
<h5 align='center'>made with ❤️</h5>
