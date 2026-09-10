import { describe, expect, it } from 'vitest'
import { hashSeed, nextFloat, nextInt, pickWeighted } from '../rng'

describe('rng', () => {
  it('同一 seed 產生同一序列', () => {
    const run = () => {
      let s = hashSeed('abyss')
      const out: number[] = []
      for (let i = 0; i < 20; i++) {
        const [v, ns] = nextFloat(s)
        s = ns
        out.push(v)
      }
      return out
    }
    expect(run()).toEqual(run())
  })

  it('不同 seed 產生不同序列', () => {
    const [a] = nextFloat(hashSeed('a'))
    const [b] = nextFloat(hashSeed('b'))
    expect(a).not.toBe(b)
  })

  it('nextInt 落在含端點的範圍內', () => {
    let s = hashSeed('range')
    for (let i = 0; i < 500; i++) {
      const [v, ns] = nextInt(s, 2, 5)
      s = ns
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThanOrEqual(5)
    }
  })

  it('pickWeighted 不會選到零權重的項目', () => {
    let s = hashSeed('weighted')
    for (let i = 0; i < 200; i++) {
      const [v, ns] = pickWeighted(s, ['yes', 'never'], [1, 0])
      s = ns
      expect(v).toBe('yes')
    }
  })
})
