# Trackstar Documentation

This repo powers the documentation currently available at [docs.trackstarhq.com](https://docs.trackstarhq.com)

### Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mintlify) to preview the documentation changes locally. To install, use the following command

```
npm i mintlify -g
```

Run the following command at the root of your documentation (where mint.json is)

```
mintlify dev
```

### Updating

```
curl https://production.trackstarhq.com/openapi.json > openapi.json
```
