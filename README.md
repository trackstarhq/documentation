# Trackstar Documentation

This repo powers the documentation currently available at [docs.trackstarhq.com](https://docs.trackstarhq.com)

### Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mintlify) to preview the documentation changes locally. To install, use the following command

```
npm i mintlify -g
```

Run the following command at the root of your documentation (where docs.json is)

```
mintlify dev
```

Mintlify doesn't support Node 25+. If `mintlify dev` fails with `not supported on node versions 25+`, run it under Node 22 without changing your global Node:

```
npx -y -p node@22 -p mintlify -c 'mintlify dev'
```

### Previewing unreleased API changes

The API reference pages render from the production OpenAPI spec (the `api.openapi` key in `docs.json`), so spec changes on a pokedex branch don't show up here until they're deployed. To preview them before that:

1. In pokedex, check out your branch and run `yarn serve`.
2. In this repo, save the spec from your local server:
   ```
   curl localhost:8000/openapi.json > openapi.json
   ```
3. In `docs.json`, delete the `api.openapi` key. Mintlify then uses the local `openapi.json`.
4. Run `mintlify dev`.

Don't merge `openapi.json` or the `docs.json` change into `main`. The live docs would then describe API behavior that hasn't shipped yet. Revert both when you're done.

To share the preview, commit those two changes to a throwaway branch and open a **draft** PR against `main` titled "do not merge". Mintlify only builds previews for PRs against `main`, and it posts the preview link as a comment on the PR. A draft can't be merged by accident. Close the PR once the pokedex change ships.

### Updating

Just push the image from `pokedex` - the push script should handle it!

### Troubleshooting
If the OpenAPI documentation / endpoints aren't loading as expected, use steps 1–3 of [Previewing unreleased API changes](#previewing-unreleased-api-changes) (with pokedex on `main`) to point the docs at a local copy of the spec. Revert once the production spec loads again.
