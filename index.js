const child_process = require('child_process');
const core = require('@actions/core');
const fs = require('fs');
const os = require('os');
const path = require('path');

try {
    const COMMENT_PREFIX = 'git@github.com:';
    const COMMENT_POSTFIX = '.git';
    const GITHUB_COM = 'github.com ssh-rsa '
        + 'AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTT'
        + 'vDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL'
        + '7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5d'
        + 'Ig6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGx'
        + 'kxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGW'
        + 'OWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bD'
        + 'YirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kq'
        + 'x5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/Wnw'
        + 'H6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=';
    const EMPTY_KEYS = 'The parameter "keys" is empty';
    const ILLEGAL_KEY_COMMENT_PREFIX
        = `key comment doesn't start with "${COMMENT_PREFIX}"`;
    const ILLEGAL_KEY_COMMENT_POSTFIX
        = `key comment doesn't end with "${COMMENT_POSTFIX}"`;
    const homeDir = os.homedir();
    const homeDotSshDir = path.join(homeDir, '.ssh');
    const keyList = core.getInput('keys');
    if (keyList === null) {
        core.setFailed(EMPTY_KEYS);
        return;
    }
    const trimmedKeyList = keyList.trim();
    if (trimmedKeyList.length === 0) {
        core.setFailed(EMPTY_KEYS);
        return;
    }
    const allKeys = trimmedKeyList.split(/(?=-----BEGIN)/);
    const n = allKeys.length;
    if (n === 0) {
        core.setFailed(EMPTY_KEYS);
        return;
    }
    fs.mkdirSync(homeDotSshDir, { recursive: true });
    const knownHostsFile = path.join(homeDotSshDir, 'known_hosts');
    fs.writeFileSync(knownHostsFile, GITHUB_COM + os.EOL);
    console.log(`${knownHostsFile}: created`);
    let sshConfigList = [];
    for (let k = 0; k < n; ++k) {
        const keyLines = allKeys[k].trim()
             .split(/\r?\n/);
        const key = keyLines.flatMap(i => [i, '\n'])
             .join('');
        const fakeHost = `fake${k}.github.com`;
        const keyFile = path.join(homeDotSshDir, fakeHost);
        const publicKeyFile = keyFile + '.pub';
        fs.writeFileSync(keyFile, key, { mode: 0o400 });
        console.log(`${keyFile}: created`);

        if (keyLines.length < 2) {
            core.setFailed(`${keyFile}: too short lines`);
            return;
        }
        const firstLine = keyLines[0];
        const lastLine = keyLines[keyLines.length - 1];
        if (!firstLine.startsWith('-----BEGIN')
                || !firstLine.endsWith('-----')
                || !lastLine.startsWith('-----END')
                || !lastLine.endsWith('-----')) {
            core.setFailed(`${keyFile}: `
                + 'private key must start with the line "-----BEGIN...-----" '
                + 'and end with the line "-----END...-----"');
            return;
        }

        child_process.execSync(
            `ssh-keygen -y -f ${keyFile} > ${publicKeyFile}`);
        console.log(`${publicKeyFile}: created`);
        const data = fs.readFileSync(publicKeyFile, { encoding: 'utf8' });
        const all = data.trim().split(' ');
        if (all.length !== 3) {
            core.setFailed(`${keyFile}: illegal comment: ${data}`);
            return;
        }
        const comment = all[2];
        console.log(`${keyFile}: key comment is "${comment}"`);
        if (!comment.startsWith(COMMENT_PREFIX)) {
            core.setFailed(`${keyFile}: ${ILLEGAL_KEY_COMMENT_PREFIX}`);
            return;
        }
        if (!comment.endsWith(COMMENT_POSTFIX)) {
            core.setFailed(`${keyFile}: ${ILLEGAL_KEY_COMMENT_POSTFIX}`);
            return;
        }
        const url = comment.slice(0, -COMMENT_POSTFIX.length);
        const pathOfUrl = url.slice(COMMENT_PREFIX.length);
        const newUrl = `git@${fakeHost}:${pathOfUrl}`;
        child_process.execSync(
            `git config --global url.${newUrl}.insteadOf ${url}`);
        sshConfigList.push(`Host ${fakeHost}`,
            '  HostName github.com',
            `  IdentityFile ${keyFile}`,
            '  IdentitiesOnly yes',
            '');
    }
    const sshConfig = sshConfigList.join(os.EOL);
    const sshConfigFile = path.join(homeDotSshDir, 'config');
    fs.writeFileSync(sshConfigFile, sshConfig);
    console.log(`${sshConfigFile}: created`);
} catch (error) {
    core.setFailed(error.message);
}
