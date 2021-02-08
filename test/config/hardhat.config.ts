import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-ethers'

const config: HardhatUserConfig = {
  paths: {
    tests: '../../test',
    cache: '../temp/cache',
  },
  mocha: {
    timeout: 60_000,
  },
}

export default config
