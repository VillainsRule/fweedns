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

the captcha solver is prebundled as an onnx file, and the training data is in [./train](./train/). here's what stuff is:

- `caps` - about 1,000 captcha images that should be correctly labeled
- `v1` - older training code that created the first version of the solver; it has lower accuracy and is not recommended for use
- `v2` - newer training code that created the current version of the solver; it has higher accuracy and is recommended for use
    - `train.py` - the main training loop; it will train the model on the training data and save the output to `./checkpoints/best.pt`
    - `evaluate.py` - evaluates the current solver on the training data to see how many it gets corrected
        - this is NOT a measure of overall modal performance, only a measure of regression
        - even if you add more samples to `caps`, the model may regress. it's recomended that, if you make changes to the model that improve it, you commit it to git so that you may revert if your next edits regress.
    - `export.py` - exports the best checkpoint to an onnx file for use in the main program

if you want to work on the model in the future, it is notoriously bad at repeating letters. start there!

<br><br>
<h2 align='center'>account creation</h2>

this uses [malq](https://malq.villainsrule.xyz) under the hood to create email-verified accounts. malq does not have any authentication, and i'd like to keep it that way. if you spam malq too hard, your IP will be permanntly banned.

<br><br>
<h5 align='center'>made with ❤️</h5>
