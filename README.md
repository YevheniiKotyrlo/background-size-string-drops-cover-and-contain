# `backgroundSize` strings holding `cover` or `contain` lose every size

Runs `processBackgroundSize`, the processor of every View's `backgroundSize` style, as `react-native@0.88.1` and `react-native@0.90.0-nightly-20261122-d6ea9fc1e` (main at `d6ea9fc1ee`) publish it.

```sh
./repro.sh               # both versions
./repro.sh 0.89.0-rc.2   # other versions, or a path to a processBackgroundSize.js
```

It needs Node 22 or later and npm. `repro.sh` installs `flow-remove-types`, pinned in `package.json`, and runs `repro.mjs`, which downloads each version's tarball from npm, checks it against its integrity, strips the Flow types from `Libraries/StyleSheet/processBackgroundSize.js` and calls the processor with five inputs.

Exit status: 1 while a string holding `cover` or `contain` comes back without them, 0 once every input gives its expected result, 2 when a step fails or an input holding neither keyword gives another result.
