# Live Skeet

A stripped-back Bluesky client built for one job: posting a thread while
something is happening. Type, press Cmd or Ctrl and Enter, keep typing. Every
post continues the thread, and the composer never moves or loses focus.

Built on [`@bsky/sdk`](https://npmx.dev/package/@bsky/sdk) and `@atproto/lex`.

## Running it

```sh
bun install
bun dev
```

Then open http://localhost:3000.

## How it works

Everything runs in the browser. There is no backend, no API route, and nothing
is sent anywhere except your PDS, the Bluesky appview, and whichever AI provider
you configure for alt text.

- **Sign in.** Type your handle; the typeahead suggests accounts and the DID
  document is read to work out which PDS you are on, so self-hosted accounts
  work without any configuration. Sign in with an app password, created at
  Settings, then Privacy and security, then App passwords in the Bluesky app.
  Because there is no server, an app password is the only safe way to hold a
  session: it cannot change your email or password and can be revoked whenever
  you like. It is kept in this browser only.
- **Threads.** Start a new thread and the first post becomes the root, or paste
  the link to an existing post to carry on from there. Both `at://` URIs and
  `bsky.app/profile/.../post/...` links are accepted, and your existing replies
  in that thread are loaded from your repository.
- **Sending.** Posts are queued in order, so each one lands as a reply to the
  last. The composer clears the instant you press send and the network work
  happens behind it. Attachments are uploaded the moment they are added, so
  pressing send does not wait on them.
- **Media.** Paste, drop, or pick up to four images, or one video. Images are
  kept at full detail up to 2 MB and 4096 pixels on the long edge, and only
  re-encoded if they exceed that. Videos may be up to 300 MB and 10 minutes;
  size and length are checked before anything is uploaded, and the file goes
  through Bluesky's video service to be processed before the post goes out.
- **Alt text.** With a vision model configured, alt text is written in the
  background as soon as an image lands. Open any thumbnail to read or edit it.
  Posting without alt text is allowed, with a nudge you can turn off.
- **Engagement.** Likes, reposts, replies and quotes are re-read every 30
  seconds by default, and immediately when the window regains focus.

## Deploying

The app is a static export, so it needs no server:

```sh
bun run build   # writes ./out
```

On Cloudflare Pages, set the build command to `bun run build` and the output
directory to `out`. Any static host works the same way.

## Settings

Open with the cog, or Cmd/Ctrl and comma.

- Theme: follows the system by default, or force light or dark.
- Compact layout, for a narrow split-screen window next to a live stream.
- Post language tag, engagement refresh interval, alt text nudge, image
  shrinking.
- Alt text provider: OpenRouter with any model ID that accepts images, or any
  OpenAI-compatible endpoint. The language the alt text is written in is set
  here too.

API keys are stored in this browser only, and are sent straight to the provider
you choose.

## Keyboard

| Key | Action |
| --- | --- |
| Cmd/Ctrl + Enter | Send the post or reply |
| Cmd/Ctrl + , | Open settings |
| Escape | Close a sheet |

## Design

Neutral throughout: blacks, greys and whites in both themes, with colour used
only where a state has to be noticed. Type is the system UI stack, nothing
loaded over the network. Icons are [Lucide](https://lucide.dev) (ISC licence).

Long threads use `content-visibility` so scrolling stays cheap however many
posts pile up, presses have a small physical response, and every animation is
transform and opacity only, disabled under `prefers-reduced-motion`. The layout
uses dynamic viewport units and safe-area insets, so it behaves on a phone with
the keyboard open and when installed to the home screen.
