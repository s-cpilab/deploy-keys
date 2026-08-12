'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INDEX_JS = path.join(__dirname, '..', 'index.js');

function runAction(keys, homeDir) {
    const home = homeDir ?? fs.mkdtempSync(
        path.join(os.tmpdir(), 'deploy-keys-test-'));
    const result = spawnSync(process.execPath, [INDEX_JS], {
        env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            INPUT_KEYS: keys
        },
        encoding: 'utf8'
    });
    return { ...result, home };
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateKey(dir, name, comment) {
    const keyFile = path.join(dir, name);
    const result = spawnSync('ssh-keygen', [
        '-f', keyFile,
        '-N', '',
        '-C', comment,
        '-q'
    ]);
    assert.equal(result.status, 0,
        `ssh-keygen failed: ${result.error ?? result.stderr}`);
    return fs.readFileSync(keyFile, { encoding: 'utf8' });
}

test('fails when keys is empty', () => {
    const { status, stdout, stderr } = runAction('');
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /The parameter "keys" is empty/);
});

test('fails when keys is only whitespace', () => {
    const { status, stdout, stderr } = runAction('   \n  ');
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /The parameter "keys" is empty/);
});

test('fails when the key has too few lines', () => {
    const { status, stdout, stderr } = runAction('hello world');
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /too short lines/);
});

test('fails when the key is not a valid private key format', () => {
    const { status, stdout, stderr } = runAction('hello\nworld');
    assert.notEqual(status, 0);
    assert.match(stdout + stderr,
        /private key must start with the line/);
});

test('fails when the generated public key has an empty comment', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-keys-key-'));
    const key = generateKey(dir, 'invalid', '');
    const { status, stdout, stderr } = runAction(key);
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /illegal comment/);
});

test('fails when the key comment has no URL prefix', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-keys-key-'));
    const key = generateKey(dir, 'invalid', 'hello');
    const { status, stdout, stderr } = runAction(key);
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /key comment doesn't start with/);
});

test('fails when the key comment does not start with git@github.com:', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-keys-key-'));
    const key = generateKey(
        dir, 'invalid', 'foobar@github.com:foo/bar.git');
    const { status, stdout, stderr } = runAction(key);
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /key comment doesn't start with/);
});

test('fails when the key comment does not end with .git', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-keys-key-'));
    const key = generateKey(dir, 'invalid', 'git@github.com:foo/bar');
    const { status, stdout, stderr } = runAction(key);
    assert.notEqual(status, 0);
    assert.match(stdout + stderr, /key comment doesn't end with/);
});

test('succeeds with a valid key and configures ssh and git', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-keys-key-'));
    const key = generateKey(dir, 'valid', 'git@github.com:foo/bar.git');
    const { status, home } = runAction(key);
    assert.equal(status, 0);

    const sshDir = path.join(home, '.ssh');
    const knownHosts = fs.readFileSync(
        path.join(sshDir, 'known_hosts'), { encoding: 'utf8' });
    assert.match(knownHosts, /^github\.com ssh-rsa /);

    const keyFile = path.join(sshDir, 'fake0.github.com');
    assert.ok(fs.existsSync(keyFile));
    assert.ok(fs.existsSync(`${keyFile}.pub`));

    const sshConfig = fs.readFileSync(
        path.join(sshDir, 'config'), { encoding: 'utf8' });
    assert.match(sshConfig, /Host fake0\.github\.com/);
    assert.match(sshConfig, /HostName github\.com/);
    assert.match(sshConfig, new RegExp(
        `IdentityFile ${escapeRegExp(keyFile)}`));

    const gitConfig = spawnSync('git', [
        'config', '--global', '--get',
        'url.git@fake0.github.com:foo/bar.insteadOf'
    ], {
        env: { ...process.env, HOME: home, USERPROFILE: home },
        encoding: 'utf8'
    });
    assert.equal(gitConfig.stdout.trim(), 'git@github.com:foo/bar');
});

test('succeeds with multiple keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-keys-key-'));
    const key1 = generateKey(dir, 'valid1', 'git@github.com:foo/bar.git');
    const key2 = generateKey(dir, 'valid2', 'git@github.com:baz/qux.git');
    const { status, home } = runAction(`${key1}${key2}`);
    assert.equal(status, 0);

    const sshDir = path.join(home, '.ssh');
    assert.ok(fs.existsSync(path.join(sshDir, 'fake0.github.com')));
    assert.ok(fs.existsSync(path.join(sshDir, 'fake1.github.com')));
});
