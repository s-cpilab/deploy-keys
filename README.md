# Deploy Keys action

This action modifies the Git and SSH configuration with the specified GitHub
[deploy keys][gh:deploy-keys] to access other private repositories on the
GitHub-hosted Windows, Linux, and macOS runners.

Note that this action does not use `ssh-agent`.

## Inputs

### `keys`

**Required** Deploy keys of other private repositories.

To create a deploy key available for this action, you need to embed the SSH URL
of the repository into the key comment. For instance, if the SSH URL of the
repository is `git@github.com:foo/bar.git`, you can create the deploy key using
the following command: `ssh-keygen … -C 'git@github.com:foo/bar.git'`.

## Example usage

```yaml
    steps:
    - name: Setting up deploy keys
      uses: maroontress/deploy-keys@v1
      with:
        keys: |
          ${{ secret.BAR_DEPLOY_KEY }}
          ${{ secret.BAZ_DEPLOY_KEY }}
    - name: Clone the private repositories
      shell: bash
      run: |
        git clone --depth 1 git@github.com:foo/bar.git
        git clone --depth 1 git@github.com:foo/baz.git
```

Please use [a full-length commit SHA][gh:using-shas] instead of the tag like
`v1`. For a more realistic example, see [here][maroontress:try_out].

## How it works

This action assigns a unique fake hostname to each repository in the Git layer,
converts the fake hostname to `github.com` in the SSH layer, and associates the
fake host with the SSH key of the corresponding repository.

### 1. `git config`

This action modifies the `~/.gitconfig` file by executing `git config` with
[`url.<base>.instantOf`][git:url_insteadof] variables for each deploy key. After
running this action, you can check the configuration with
`git config --global --list`, which prints as follows:

```plaintext
url.git@fake0.github.com:foo/bar.insteadof=git@github.com:foo/bar
url.git@fake1.github.com:foo/baz.insteadof=git@github.com:foo/baz
```

### 2. `~/.ssh/config` and `~/.ssh/known_hosts`

This action overwrites `~/.ssh/config`. After running this action, the content
of `~/.ssh/config` will be as follows:

```plaintext
Host fake0.github.com
  HostName github.com
  IdentityFile C:\Users\runneradmin\.ssh\fake0.github.com
  IdentitiesOnly yes

Host fake1.github.com
  HostName github.com
  IdentityFile C:\Users\runneradmin\.ssh\fake1.github.com
  IdentitiesOnly yes
```

The path of `IdentityFile` will vary depending on the platform (the above
example is on the Windows runner).

This action also creates `~/.ssh/known_hosts` containing the SSH public key of
`github.com`.

### 3. SSH private keys in `~/.ssh`

This action creates <code>~/.ssh/fake<i>N</i>.github.com</code>
(<code><i>N</i></code> = 0, 1, &hellip;) files to save the deploy keys (i.e.,
the SSH private keys). These files are referenced by the `IdentityFile` entries
in `~/.ssh/config`.

## Remarks

Don't use this action on the persistent self-hosted runners.

For serious use of this action, to mitigate the security risks, you should:

- Copy (fork) this repository to your organization before using it,
  and then use your private (or public) repository you copied or
- [Pin this action to a full length-commit SHA][gh:using-third-party-actions].

It is also advisable to audit the source code of this action before use.

## Build

See [_Commit, tag, and push your action to GitHub_ &mdash; Creating a JavaScript
action][gh:vercel_ncc].

```plaintext
sudo npm i -g @vercel/ncc
ncc build index.js --license licenses.txt
```

## Lint

```plaintext
npx eslint index.js
```

[gh:deploy-keys]:
  https://docs.github.com/ja/authentication/connecting-to-github-with-ssh/managing-deploy-keys#deploy-keys
[gh:vercel_ncc]:
  https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action#commit-tag-and-push-your-action-to-github
[git:url_insteadof]:
  https://git-scm.com/docs/git-config#Documentation/git-config.txt-urlltbasegtinsteadOf
[gh:using-third-party-actions]:
  https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions
[gh:using-shas]:
  https://docs.github.com/en/actions/learn-github-actions/finding-and-customizing-actions#using-shas
[maroontress:try_out]:
  https://github.com/maroontress/try_out_github_actions/blob/deploy-keys/.github/workflows/deploy-keys.yml
