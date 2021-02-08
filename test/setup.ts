/* External Imports */
import chai = require('chai')
import Mocha from 'mocha'

import chaiSubset = require('chai-subset')
chai.use(chaiSubset)

const should = chai.should()
const expect = chai.expect

export { should, expect, Mocha }
