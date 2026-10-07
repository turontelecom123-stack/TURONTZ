/* Starts a real Turon TZ server in a temp folder for a test file. */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const SERVER = path.join(__dirname, '..', 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startServer(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turontz-test-'));
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port), HOST: '127.0.0.1',
      TURON_DB_FILE: path.join(dir, 'db.json'), TURON_UPLOAD_DIR: path.join(dir, 'uploads'),
      TURON_TELEGRAM_FILE: path.join(dir, 'telegram.json'),
      AI_PROVIDER: 'offline', OLLAMA_URL: 'http://127.0.0.1:1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch (e) {}
    if (child.exitCode !== null) throw new Error('server exited:\n' + log);
    await new Promise(r => setTimeout(r, 100));
  }
  const api = async (p, { method = 'GET', body, token, raw } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: { ...(raw ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined),
    });
    let data = null; try { data = await res.json(); } catch (e) {}
    return { status: res.status, data, headers: res.headers };
  };
  const stop = () => new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); resolve(); });
    child.kill();
  });
  return { base, api, stop, dir, log: () => log };
}

// First user becomes the active SMM manager; returns tokens for a manager and a designer.
async function seedTeam(api) {
  const smm = (await api('/api/register', { method: 'POST', body: { name: 'Boss', login: 'boss', password: 'boss-pass', role: 'smm' } })).data.token;
  const design = (await api('/api/admin/users', { method: 'POST', token: smm, body: { name: 'Dina', login: 'dina', password: 'dina-pass', role: 'design' } })).data;
  const design2 = (await api('/api/admin/users', { method: 'POST', token: smm, body: { name: 'Dima', login: 'dima', password: 'dima-pass', role: 'design' } })).data;
  const dinaToken = (await api('/api/login', { method: 'POST', body: { login: 'dina', password: 'dina-pass' } })).data.token;
  const dimaToken = (await api('/api/login', { method: 'POST', body: { login: 'dima', password: 'dima-pass' } })).data.token;
  return { smm, dina: { id: design.id, token: dinaToken }, dima: { id: design2.id, token: dimaToken } };
}

module.exports = { startServer, seedTeam };
