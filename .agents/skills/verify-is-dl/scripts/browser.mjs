#!/usr/bin/env node
const argv = process.argv.slice(2);
let port = process.env.IS_DL_VERIFY_CDP_PORT;
if (argv[0] === '--port') {
  port = argv[1];
  argv.splice(0, 2);
}
if (!port) fail('Set IS_DL_VERIFY_CDP_PORT or pass --port <port>.');
const base = `http://127.0.0.1:${port}`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

async function targets() {
  const response = await fetch(`${base}/json/list`).catch((error) => {
    fail(`No CDP endpoint on ${base}: ${error.message}`);
  });
  return response.json();
}

async function findTarget(match) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const matches = (await targets()).filter(
      (target) =>
        target.type === 'page' &&
        target.webSocketDebuggerUrl &&
        (target.url.includes(match) || target.title === match),
    );
    if (matches[0]) return matches[0];
    if (Date.now() > deadline) fail(`No page matching ${JSON.stringify(match)}.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function session(target, run) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
    else entry.resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 60_000);
      pending.set(id, { resolve, reject, timer, method });
      socket.send(JSON.stringify({ id, method, params }));
    });

  try {
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), {
        once: true,
      });
    });
    return await run(send);
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    socket.close();
  }
}

async function evaluate(match, expression) {
  const target = await findTarget(match);
  return session(target, async (send) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      fail(result.exceptionDetails.exception?.description ?? 'Evaluation threw.');
    }
    return result.result.value;
  });
}

const quote = (value) => JSON.stringify(value);
const pick = (selector) =>
  `(() => { const el = document.querySelector(${quote(selector)});
    if (!el) throw new Error('No element matching ' + ${quote(selector)});
    return el; })()`;

const [command, ...rest] = argv;

if (command === 'targets') {
  for (const target of await targets()) process.stdout.write(`${target.type}\t${target.url}\n`);
} else if (command === 'eval') {
  const [match, expression] = rest;
  if (!match || !expression) fail('Usage: browser.mjs eval <match> <expression>');
  const value = await evaluate(match, expression);
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);
} else if (command === 'text') {
  const [match] = rest;
  if (!match) fail('Usage: browser.mjs text <match>');
  process.stdout.write(`${await evaluate(match, 'document.body.innerText')}\n`);
} else if (command === 'shot') {
  const full = rest[0] === '--full' && rest.shift();
  const [match, file] = rest;
  if (!match || !file) fail('Usage: browser.mjs shot [--full] <match> <file>');
  const target = await findTarget(match);
  const { data } = await session(target, async (send) => {
    await send('Page.bringToFront').catch(() => {});
    if (!full) return send('Page.captureScreenshot', { format: 'png' });
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    return send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: cssContentSize.width,
        height: cssContentSize.height,
        scale: 1,
      },
    });
  });
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(data, 'base64'));
  process.stdout.write(`${file}\n`);
} else if (command === 'wait') {
  const [match, needle, timeout = '20000'] = rest;
  if (!match || !needle) fail('Usage: browser.mjs wait <match> <needle> [timeoutMs]');
  const deadline = Date.now() + Number(timeout);
  for (;;) {
    const text = await evaluate(match, 'document.body.innerText');
    if (String(text).includes(needle)) break;
    if (Date.now() > deadline) fail(`Timed out waiting for ${JSON.stringify(needle)}.`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  process.stdout.write(`${needle}\n`);
} else if (command === 'click') {
  const [match, selector] = rest;
  if (!match || !selector) fail('Usage: browser.mjs click <match> <selector>');
  await evaluate(match, `${pick(selector)}.click()`);
  process.stdout.write(`clicked ${selector}\n`);
} else if (command === 'click-text') {
  const [match, selector, text] = rest;
  if (!match || !selector || !text) {
    fail('Usage: browser.mjs click-text <match> <selector> <text>');
  }
  await evaluate(
    match,
    `(() => { const elements = [...document.querySelectorAll(${quote(selector)})];
      const el = elements.find((candidate) => candidate.textContent.trim() === ${quote(text)});
      if (!el) throw new Error('No matching element with text ' + ${quote(text)});
      el.click(); })()`,
  );
  process.stdout.write(`clicked ${selector} with text ${text}\n`);
} else if (command === 'fill') {
  const [match, selector, value] = rest;
  if (!match || !selector || value === undefined) {
    fail('Usage: browser.mjs fill <match> <selector> <value>');
  }
  await evaluate(
    match,
    `(() => { const el = ${pick(selector)};
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${quote(value)});
      el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  process.stdout.write(`${selector}=${value}\n`);
} else if (command === 'close') {
  const info = await fetch(`${base}/json/version`).then((response) => response.json());
  await session({ webSocketDebuggerUrl: info.webSocketDebuggerUrl }, (send) =>
    send('Browser.close'),
  ).catch(() => {});
  process.stdout.write('closing\n');
} else {
  fail('Usage: browser.mjs targets|eval|text|shot|wait|click|click-text|fill|close ...');
}
