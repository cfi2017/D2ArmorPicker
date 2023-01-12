
# move wasm to assets for easier importing
cp node_modules/armor/armor_bg.wasm src/assets/armor_bg.wasm
cp node_modules/@parallel/armor/armor_bg.wasm src/assets/parallel_armor_bg.wasm

# replace necessary paths
sed -i '' "s/new URL('armor_bg.wasm', import.meta.url)/'assets\/armor_bg.wasm'/g" node_modules/armor/armor.js
sed -i '' "s/new URL('armor_bg.wasm', import.meta.url)/'assets\/parallel_armor_bg.wasm'/g" node_modules/@parallel/armor/armor.js
