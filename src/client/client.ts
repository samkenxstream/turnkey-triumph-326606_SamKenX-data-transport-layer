import { EnqueueEntry } from '../types'
import fetch from 'node-fetch'

export class L1DataTransportClient {
  constructor(private endpoint: string) {}

  public async getEnqueueByIndex(index: number): Promise<EnqueueEntry> {
    const response = await fetch(`${this.endpoint}/enqueue/index/${index}`)
    return response.json()
  }
}
