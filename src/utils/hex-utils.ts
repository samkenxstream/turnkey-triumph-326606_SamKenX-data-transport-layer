/* Imports: External */
import { BigNumber } from 'ethers'

export const fromHexString = (buf: Buffer | string): Buffer => {
  if (typeof buf === 'string' && buf.startsWith('0x')) {
    return Buffer.from(buf.slice(2), 'hex')
  }

  return Buffer.from(buf)
}

export const toHexString = (buf: Buffer | string | number | null): string => {
  if (typeof buf === 'number') {
    return BigNumber.from(buf).toHexString()
  } else {
    return '0x' + fromHexString(buf).toString('hex')
  }
}
