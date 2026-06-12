# Archives

## Box
```
aipkg.json
LICENSE.txt
README.md
setup.json
skills/<slugs>/SKILL.md
rules/<slugs>.md
subagents/<slugs>.md
```

## Rule/Subagent
```
aipkg.json
LICENSE.txt
README.md
<slug>.md
```

## Skill
```
aipkg.json
LICENSE.txt
README.md
SKILL.md
assets/**/*
**/*
```

## Params

```
aipkg.json
LICENSE.txt
README.md
setup.json
assets/**/*
**/*
```


# Universal Archive

Can we parse the above into the programmatic shape bellow
```ts
type AIpkgArchive = {
  manifest: Manifest,
  pkgRef: PackageRef,
  sha: string,
  rules: { slug: string, doc: Buffer }[]
  subagents: { slug: string, doc: Buffer }[]
  skills: { slug: string, assets: TarEntry }[]
  params?: { events: Hooks, statusLine: any, mcps: any }
}
```
