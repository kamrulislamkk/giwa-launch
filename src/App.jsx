
import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import {
  connectWallet,
  CONTRACT_ADDRESS,
  NETWORK,
  ABI
} from './contracts'

const sections = [
  'Market', 'Trade', 'Launch',
  'Fundraise', 'Portfolio', 'Stake'
]

const tokenABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function approve(address,uint256) returns (bool)'
]

export default function App() {
  const [active, setActive] = useState('Market')
  const [wallet, setWallet] = useState('')
  const [tokens, setTokens] = useState([])
  const [search, setSearch] = useState('')
  const [tokenAddress, setTokenAddress] = useState('')
  const [tradeType, setTradeType] = useState('buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const provider = new ethers.JsonRpcProvider(
    NETWORK.rpcUrls[0],
    Number(BigInt(NETWORK.chainId))
  )

  const readContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    ABI,
    provider
  )

  async function loadMarket() {
    try {
      setLoading(true)
      setError('')

      const count = Number(await readContract.tokenCount())

      const results = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const address = await readContract.tokenAt(i)
          const data = await readContract.tokens(address)

          if (!data[7]) return null

          const token = new ethers.Contract(
            address,
            tokenABI,
            provider
          )

          const [name, symbol] = await Promise.all([
            token.name(),
            token.symbol()
          ])

          let logo = ''
          try {
            logo = await readContract.tokenLogoURI(address)
          } catch {}

          return {
            address,
            name,
            symbol,
            logo,
            price: ethers.formatUnits(data[2], 18),
            volume: ethers.formatEther(data[5]),
            reserve: ethers.formatEther(data[4]),
            fee: Number(data[6]) / 100
          }
        })
      )

      const list = results.filter(Boolean).reverse()
      setTokens(list)

      if (list.length && !tokenAddress) {
        setTokenAddress(list[0].address)
      }
    } catch (err) {
      setError(err.shortMessage || err.message || 'Could not load tokens')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMarket()
  }, [])

  async function handleConnect() {
    try {
      setError('')
      const result = await connectWallet()
      setWallet(result.address)
      setMessage('Wallet connected successfully')
    } catch (err) {
      setError(err.shortMessage || err.message || 'Wallet connection failed')
    }
  }

  async function getQuote() {
    try {
      setError('')
      setMessage('')
      setQuote('')

      if (!ethers.isAddress(tokenAddress)) {
        throw new Error('Enter a valid token address')
      }

      if (!amount || Number(amount) <= 0) {
        throw new Error('Enter an amount greater than zero')
      }

      let result

      if (tradeType === 'buy') {
        const ethAmount = ethers.parseEther(amount)
        result = await readContract.quoteBuy(tokenAddress, ethAmount)
        setQuote(ethers.formatUnits(result, 18) + ' tokens')
      } else {
        const tokenAmount = ethers.parseUnits(amount, 18)
        result = await readContract.quoteSell(tokenAddress, tokenAmount)
        setQuote(ethers.formatEther(result) + ' ETH')
      }
    } catch (err) {
      setError(err.shortMessage || err.message || 'Quote failed')
    }
  }

  async function executeTrade() {
    try {
      setError('')
      setMessage('')

      if (!wallet) {
        throw new Error('Connect your wallet first')
      }

      if (!ethers.isAddress(tokenAddress)) {
        throw new Error('Enter a valid token address')
      }

      if (!amount || Number(amount) <= 0) {
        throw new Error('Enter a valid amount')
      }

      setLoading(true)

      const connection = await connectWallet()
      const contract = connection.contract

      if (tradeType === 'buy') {
        const ethAmount = ethers.parseEther(amount)
        const quotedTokens = await contract.quoteBuy(
          tokenAddress,
          ethAmount
        )

        const minimumTokens = quotedTokens * 99n / 100n

        setMessage('Confirm your buy transaction in MetaMask...')

        const tx = await contract.buy(
          tokenAddress,
          minimumTokens,
          { value: ethAmount }
        )

        setMessage('Buy transaction submitted. Waiting for confirmation...')
        await tx.wait()
        setMessage('Buy successful!')
      } else {
        const tokenAmount = ethers.parseUnits(amount, 18)

        const quotedETH = await contract.quoteSell(
          tokenAddress,
          tokenAmount
        )

        const minimumETH = quotedETH * 99n / 100n

        const token = new ethers.Contract(
          tokenAddress,
          tokenABI,
          connection.signer
        )

        setMessage('Approve tokens in MetaMask...')

        const approval = await token.approve(
          CONTRACT_ADDRESS,
          tokenAmount
        )

        await approval.wait()

        setMessage('Approval confirmed. Confirm your sell transaction...')

        const tx = await contract.sell(
          tokenAddress,
          tokenAmount,
          minimumETH
        )

        setMessage('Sell transaction submitted. Waiting for confirmation...')
        await tx.wait()
        setMessage('Sell successful!')
      }

      setQuote('')
      setAmount('')
      await loadMarket()
    } catch (err) {
      setError(err.shortMessage || err.message || 'Transaction failed')
    } finally {
      setLoading(false)
    }
  }

  const filteredTokens = tokens.filter(token =>
    `${token.name} ${token.symbol} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <div className="app">
      <header className="header">
        <h1>GIWA <span>LAUNCHPAD</span></h1>
        <button
          className="wallet"
          onClick={handleConnect}
          disabled={loading}
        >
          {wallet
            ? wallet.slice(0, 6) + '...' + wallet.slice(-4)
            : 'Connect Wallet'}
        </button>
      </header>

      <nav className="nav">
        {sections.map(section => (
          <button
            key={section}
            className={active === section ? 'active' : ''}
            onClick={() => {
              setActive(section)
              setError('')
              setMessage('')
            }}
          >
            {section}
          </button>
        ))}
      </nav>

      <main className="main">

        {active === 'Market' && (
          <>
            <h2>Token Market</h2>
            <p>Discover tokens launched on GIWA.</p>

            <div style={{ display: 'flex', gap: 10, margin: '25px 0' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tokens..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #263143',
                  background: '#111827',
                  color: 'white'
                }}
              />
              <button className="wallet" onClick={loadMarket}>
                Refresh
              </button>
            </div>

            {loading && <p>Loading tokens...</p>}

            {filteredTokens.length === 0 && !loading && (
              <p>No launched tokens found.</p>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
              gap: 16
            }}>
              {filteredTokens.map(token => (
                <div key={token.address} style={{
                  background: '#111827',
                  border: '1px solid #263143',
                  borderRadius: 12,
                  padding: 20
                }}>
                  <h3>{token.name} ({token.symbol})</h3>
                  {token.logo && (
                    <img
                      src={token.logo}
                      alt=""
                      style={{ width: 45, height: 45, borderRadius: '50%' }}
                    />
                  )}
                  <p>Price: {Number(token.price).toFixed(8)} ETH</p>
                  <p>Volume: {Number(token.volume).toFixed(4)} ETH</p>
                  <p>Reserve: {Number(token.reserve).toFixed(4)} ETH</p>
                  <p>Trading fee: {token.fee}%</p>
                  <p style={{ fontSize: 11, overflowWrap: 'anywhere' }}>
                    {token.address}
                  </p>
                  <button
                    className="wallet"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setTokenAddress(token.address)
                      setActive('Trade')
                    }}
                  >
                    Trade this token
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {active === 'Trade' && (
          <>
            <h2>Trade Tokens</h2>
            <p>Buy and sell tokens using the GIWA bonding curve.</p>

            <div style={{
              maxWidth: 480,
              marginTop: 25,
              padding: 22,
              background: '#111827',
              border: '1px solid #263143',
              borderRadius: 14
            }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
                <button
                  className="wallet"
                  style={{
                    flex: 1,
                    background: tradeType === 'buy' ? '#d7a94b' : '#263143',
                    color: tradeType === 'buy' ? '#080b12' : 'white'
                  }}
                  onClick={() => {
                    setTradeType('buy')
                    setQuote('')
                    setError('')
                    setMessage('')
                  }}
                >
                  Buy
                </button>

                <button
                  className="wallet"
                  style={{
                    flex: 1,
                    background: tradeType === 'sell' ? '#d7a94b' : '#263143',
                    color: tradeType === 'sell' ? '#080b12' : 'white'
                  }}
                  onClick={() => {
                    setTradeType('sell')
                    setQuote('')
                    setError('')
                    setMessage('')
                  }}
                >
                  Sell
                </button>
              </div>

              <label>Choose launched token</label>
              <select
                value={tokenAddress}
                onChange={e => {
                  setTokenAddress(e.target.value)
                  setQuote('')
                }}
                style={{
                  width: '100%',
                  padding: 13,
                  margin: '9px 0 18px',
                  borderRadius: 8,
                  background: '#080b12',
                  color: 'white',
                  border: '1px solid #263143'
                }}
              >
                <option value="">Select a token</option>
                {tokens.map(token => (
                  <option key={token.address} value={token.address}>
                    {token.name} ({token.symbol})
                  </option>
                ))}
              </select>

              <label>Token contract address</label>
              <input
                value={tokenAddress}
                onChange={e => {
                  setTokenAddress(e.target.value)
                  setQuote('')
                }}
                placeholder="0x..."
                style={{
                  width: '100%',
                  padding: 13,
                  margin: '9px 0 18px',
                  borderRadius: 8,
                  background: '#080b12',
                  color: 'white',
                  border: '1px solid #263143'
                }}
              />

              <label>
                {tradeType === 'buy' ? 'ETH amount to spend' : 'Token amount to sell'}
              </label>

              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={e => {
                  setAmount(e.target.value)
                  setQuote('')
                }}
                placeholder={tradeType === 'buy' ? '0.1 ETH' : '1000 tokens'}
                style={{
                  width: '100%',
                  padding: 13,
                  margin: '9px 0 18px',
                  borderRadius: 8,
                  background: '#080b12',
                  color: 'white',
                  border: '1px solid #263143'
                }}
              />

              <button
                className="wallet"
                style={{ width: '100%', marginBottom: 12 }}
                onClick={getQuote}
                disabled={loading}
              >
                Get Quote
              </button>

              {quote && (
                <p style={{ color: '#d7a94b', margin: '12px 0' }}>
                  Estimated output: {quote}
                </p>
              )}

              <button
                className="wallet"
                style={{ width: '100%' }}
                onClick={executeTrade}
                disabled={loading}
              >
                {loading
                  ? 'Processing...'
                  : tradeType === 'buy'
                    ? 'Buy Token'
                    : 'Approve & Sell'}
              </button>

              <p style={{ fontSize: 12, color: '#aab3c2', marginTop: 15 }}>
                Estimated 1% slippage protection is applied to transactions.
                Network gas fees are separate.
              </p>
            </div>
          </>
        )}

        {active === 'Stake' && (
          <>
            <h2>Stake</h2>
            <p>Coming Soon</p>
          </>
        )}

        {!['Market', 'Trade', 'Stake'].includes(active) && (
          <>
            <h2>{active}</h2>
            <p>This feature is being built.</p>
          </>
        )}

        {message && (
          <p style={{ color: '#d7a94b', marginTop: 20 }}>
            {message}
          </p>
        )}

        {error && (
          <p style={{ color: '#ff7777', marginTop: 20 }}>
            {error}
          </p>
        )}
      </main>
    </div>
  )
}
