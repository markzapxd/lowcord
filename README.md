Lowcord is a fork of [Testcord](https://github.com/TestcordDev/TestCord), which is a fork of [Equicord](https://github.com/Equicord/Equicord), which is a fork of [Vencord](https://github.com/Vendicated/Vencord) — a Discord client mod focused on simplicity, performance, and user freedom.

## Installing

### Dependencies

[Git](https://git-scm.com/) and [Node.js LTS](https://nodejs.org/) are required.

Install `pnpm`:

```sh
npm i -g pnpm
```

> Close and reopen your terminal for pnpm to be in your PATH.

Clone and build:

```sh
git clone https://github.com/TestcordDev/TestCord lowcord
cd lowcord
pnpm install --frozen-lockfile
pnpm build
pnpm inject
```

For the dev build (includes experimental plugins):

```sh
pnpm dev
```

For the web extension:

```sh
pnpm buildWeb
```

The web extension ZIP will be in the `dist` directory. Load it in your browser — Firefox requires Firefox Developer Edition.

## Credits

- [Testcord](https://github.com/TestcordDev/TestCord) — the upstream fork
- [Equicord](https://github.com/Equicord/Equicord) — by Thororen
- [Vencord](https://github.com/Vendicated/Vencord) — by Vendicated

## Disclaimer

Discord is a trademark of Discord Inc. Mentioning it does not imply any affiliation with or endorsement by Discord Inc. Lowcord is not affiliated with Discord Inc., Testcord, Equicord, or Vencord.

<details>
<summary>Using custom Discord clients violates Discord's Terms of Service</summary>
Discord's ToS prohibits third-party clients. In practice, bans are rare and only happen when abusing high-risk features. Use responsibly.
</details>
