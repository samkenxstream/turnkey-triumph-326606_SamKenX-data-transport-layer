/* External Imports */
import chai = require('chai')
import Mocha from 'mocha'

// Chai plugins go here.
chai.use(require('chai-as-promised'))

const should = chai.should()
const expect = chai.expect

export { should, expect, Mocha }
