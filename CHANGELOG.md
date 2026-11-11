# Changelog

## [0.2.0](https://github.com/zytact/is-dl/compare/v0.1.1...v0.2.0) (2026-11-11)


### Features

* add repository-wide verification skill ([569ad12](https://github.com/zytact/is-dl/commit/569ad12697704e02cfaa5f14cb1fbe567ddd2022))
* **apps:** keep the job listing with every application so it survives the board taking it down ([#51](https://github.com/zytact/is-dl/issues/51)) ([106e816](https://github.com/zytact/is-dl/commit/106e8168ff957eaf292598531b873f221c21744e))
* **notes:** change a note without deleting and rewriting it ([bd4286a](https://github.com/zytact/is-dl/commit/bd4286ae9d9879a2b30a10bdf25398122dba2d1c))
* **notes:** edit a saved note in place ([5ad00f6](https://github.com/zytact/is-dl/commit/5ad00f6c49a91cfe71f9aa7b638d4e07ca0260e7))
* **notes:** keep the hiring doc, not just the listing ([a320529](https://github.com/zytact/is-dl/commit/a320529f232b5c154c175b4dd964dd0d6874d227))
* **notes:** store the text and documents attached to a job ([11bfc21](https://github.com/zytact/is-dl/commit/11bfc219e9f34908206d9c1ab15dcc0ddb7276ca))
* **resume:** build each variant into its own folder as resume.pdf ([ffa6f69](https://github.com/zytact/is-dl/commit/ffa6f694d1789c1c5c54890f30a51e9ad81f3aa8))
* **resume:** upload a build as resume.pdf without renaming it ([28ee043](https://github.com/zytact/is-dl/commit/28ee0431e34a114427ff68da32237fb0434bc48a))
* **search:** add --exclude-seen for jobs an earlier run showed ([7cd0840](https://github.com/zytact/is-dl/commit/7cd0840cbaf11d010087bddae2f87f832b903e98))
* **search:** find Indian startup jobs with real salaries on Wellfound ([#53](https://github.com/zytact/is-dl/issues/53)) ([64f2e73](https://github.com/zytact/is-dl/commit/64f2e7377e39ef01b71158201a7b8849f5d591de))
* **search:** find startup jobs on the Y Combinator board without a login ([#45](https://github.com/zytact/is-dl/issues/45)) ([5d18e48](https://github.com/zytact/is-dl/commit/5d18e483e9431ab81983659fe6220c6c08a7b120))
* **search:** stop blocked companies from using up the search limit ([#42](https://github.com/zytact/is-dl/issues/42)) ([1f9d11d](https://github.com/zytact/is-dl/commit/1f9d11d81163e827380f1972b5841f7a4dadc222))
* **search:** stop showing me jobs I have already been shown ([8b6fe84](https://github.com/zytact/is-dl/commit/8b6fe84ff052904cc99d083ed409803e4e83559b))
* share the search pipeline between the CLI and API, and make verification portable ([#33](https://github.com/zytact/is-dl/issues/33)) ([cabeecb](https://github.com/zytact/is-dl/commit/cabeecb9798fe918cb4b39460ee8e1e446742a36))
* verify every is-dl interface with isolated state ([a0101f2](https://github.com/zytact/is-dl/commit/a0101f2937ebf4b5d04cf820a0892d6d96505cc2))


### Bug Fixes

* **linkedin:** get job descriptions back and fail loudly when they go missing ([#47](https://github.com/zytact/is-dl/issues/47)) ([9766fd5](https://github.com/zytact/is-dl/commit/9766fd5a8749460c72ab323e579285609d8b8089))
* **linkedin:** get search working again on LinkedIn's redesigned job page ([#36](https://github.com/zytact/is-dl/issues/36)) ([d2c6dcb](https://github.com/zytact/is-dl/commit/d2c6dcbc5d7b933d7c53f53d1cd4608f5d70ce7e))
* **linkedin:** keep the "I'm interested" button out of jobType and count a pay pill as pay ([#43](https://github.com/zytact/is-dl/issues/43)) ([5a3aec3](https://github.com/zytact/is-dl/commit/5a3aec316cd9232688e057e613d6ead771fdb7c1))
* **linkedin:** stop after five consecutive extraction failures ([4aa8eff](https://github.com/zytact/is-dl/commit/4aa8effabf63845f7951b3dd46627b02b32004b1))
* **linkedin:** stop losing listings from companies without a LinkedIn page ([#41](https://github.com/zytact/is-dl/issues/41)) ([4177856](https://github.com/zytact/is-dl/commit/4177856e79533bc35a1619f0b82eca61250fe02a))
* **linkedin:** stop the "… more" button label from ending every description ([#49](https://github.com/zytact/is-dl/issues/49)) ([07b0198](https://github.com/zytact/is-dl/commit/07b019811e416966955de17eeba66c846e3a785c))
* **linkedin:** wait up to --timeout for slow LinkedIn pages instead of failing at 15s ([#54](https://github.com/zytact/is-dl/issues/54)) ([2cb4313](https://github.com/zytact/is-dl/commit/2cb43131351689b79b6a0f79ab5a2dc7a1ef5b78))
* **notes:** make an edit safe to lose an editor over ([30d1515](https://github.com/zytact/is-dl/commit/30d151599369c7b1b223747c81ba8cac2ad5905b))
* **resume:** keep the last good pdf when a build fails a gate ([8b67d97](https://github.com/zytact/is-dl/commit/8b67d97a17dbde683cb2f6486e6a929d4f40fedb))
* **resume:** reject variant names that collide by case ([bced131](https://github.com/zytact/is-dl/commit/bced131e10d03a3766718136a532e426f2f0d11c))
* **search:** backfill the seen ledger on write, not only on read ([37a52f1](https://github.com/zytact/is-dl/commit/37a52f12b0a8fd1d69b6853df5bef54745de981e))
* **serve:** exit on SIGTERM instead of hanging ([19d6b79](https://github.com/zytact/is-dl/commit/19d6b79d067cfcd39cf6e58e3fa725196e280d1a))
* **verify:** keep verification recipes runnable ([#34](https://github.com/zytact/is-dl/issues/34)) ([0f22977](https://github.com/zytact/is-dl/commit/0f22977407083133857e2d302cac6de68f048dbf))


### Performance Improvements

* **cli:** load commands on demand ([3b96f0e](https://github.com/zytact/is-dl/commit/3b96f0e70519b7719ed99bcb36d45c4eee2be9d4))
* **linkedin:** wait for the page instead of a fixed sleep ([60314e3](https://github.com/zytact/is-dl/commit/60314e3126c029593d2953a2fd199a21bf974a18))
* **runs:** serve run history from the index ([dced110](https://github.com/zytact/is-dl/commit/dced110a8c2f2087a685fd4f77aabf2679d342b4))
* **search:** filter applied jobs before the scrape, not after ([c9ac2f6](https://github.com/zytact/is-dl/commit/c9ac2f6bc248fc914758ea5514dfda7bf9f5c309))
* stop is-dl doing work it throws away ([96b0f1f](https://github.com/zytact/is-dl/commit/96b0f1f50b51be21375b4117dcf3074e29207e72))
* **tui:** apply log events in batches ([b33d75d](https://github.com/zytact/is-dl/commit/b33d75db1793fe5ab73c0c72aef60fe40896f1bd))
* **unstop:** classify only the rows that are kept ([5435083](https://github.com/zytact/is-dl/commit/54350835bacf8628f47b06d2bd62e580de871307))
* **unstop:** drop known rows before classifying them ([604c672](https://github.com/zytact/is-dl/commit/604c672cf8f4c2e54163ecc92ae17a556bcc6fd2))
* **web,tui:** share one log stream and bound the console ([68697d9](https://github.com/zytact/is-dl/commit/68697d9e73066d6f9e7a316cf1d8d8debef5873c))
