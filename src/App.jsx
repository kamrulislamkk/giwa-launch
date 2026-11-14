
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
  'function totalSupply() view returns (uint256)',
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
  const [chartPoints, setChartPoints] = useState([])
  const [lastUpdated, setLastUpdated] = useState('')
  const [trades, setTrades] = useState([])
  const [tradesLoading, setTradesLoading] = useState(false)

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

          const [name, symbol, supply] = await Promise.all([
            token.name(),
            token.symbol(),
            token.totalSupply()
          ])

          let logo = ''
          try {
            logo = await readContract.tokenLogoURI(address)
          } catch {}

          const price = Number(ethers.formatUnits(data[2], 18))
          const volume = Number(ethers.formatEther(data[5]))
          const reserve = Number(ethers.formatEther(data[4]))
          const supplyNumber = Number(
            ethers.formatUnits(supply, 18)
          )

          return {
            address,
            name,
            symbol,
            logo,
            price,
            volume,
            reserve,
            supply: supplyNumber,
            marketCap: price * supplyNumber,
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
      setError(
        err.shortMessage || err.message || 'Could not load tokens'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMarket()
  }, [])

  const selectedToken = tokens.find(
    token =>
      token.address.toLowerCase() === tokenAddress.toLowerCase()
  )

  // Live price sampling every 15 seconds.
  useEffect(() => {
    if (
      active !== 'Trade' ||
      !ethers.isAddress(tokenAddress)
    ) {
      setChartPoints([])
      return
    }

    let mounted = true

    async function refreshPrice() {
      try {
        const data = await readContract.tokens(tokenAddress)
        const price = Number(
          ethers.formatUnits(data[2], 18)
        )

        if (!mounted || !Number.isFinite(price)) return

        setChartPoints(previous =>
          [
            ...previous,
            { time: Date.now(), price }
          ].slice(-40)
        )

        setLastUpdated(new Date().toLocaleTimeString())
      } catch (err) {
        console.error('Price update error:', err)
      }
    }

    refreshPrice()

    const timer = setInterval(refreshPrice, 15000)

    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [active, tokenAddress])

  // Load real Trade events from the blockchain.
  async function loadTrades() {
    if (!ethers.isAddress(tokenAddress)) {
      setTrades([])
      return
    }

    try {
      setTradesLoading(true)

      const latestBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(0, latestBlock - 5000)

      const filter = readContract.filters.Trade(tokenAddress)

      const events = await readContract.queryFilter(
        filter,
        fromBlock,
        latestBlock
      )

      const history = events.map(event => ({
        trader: event.args.trader,
        isBuy: event.args.isBuy,
        ethAmount: ethers.formatEther(
          event.args.ethAmount
        ),
        tokenAmount: ethers.formatUnits(
          event.args.tokenAmount,
          18
        ),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber
      }))

      history.sort(
        (a, b) => b.blockNumber - a.blockNumber
      )

      setTrades(history.slice(0, 20))
    } catch (err) {
      console.error('Trade history error:', err)
      setTrades([])
    } finally {
      setTradesLoading(false)
    }
  }

  // Refresh trade history when selected token changes.
  useEffect(() => {
    if (active === 'Trade' && ethers.isAddress(tokenAddress)) {
      loadTrades()
    } else {
      setTrades([])
    }
  }, [active, tokenAddress])

  async function handleConnect() {
    try {
      setError('')
      const result = await connectWallet()
      setWallet(result.address)
      setMessage('Wallet connected successfully')
    } catch (err) {
      setError(
        err.shortMessage || err.message ||
        'Wallet connection failed'
      )
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

        result = await readContract.quoteBuy(
          tokenAddress,
          ethAmount
        )

        setQuote(
          ethers.formatUnits(result, 18) + ' tokens'
        )
      } else {
        const tokenAmount = ethers.parseUnits(amount, 18)

        result = await readContract.quoteSell(
          tokenAddress,
          tokenAmount
        )

        setQuote(
          ethers.formatEther(result) + ' ETH'
        )
      }
    } catch (err) {
      setError(
        err.shortMessage || err.message || 'Quote failed'
      )
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

        setMessage('Buy submitted. Waiting for confirmation...')

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

        setMessage(
          'Approval confirmed. Confirm your sell transaction...'
        )

        const tx = await contract.sell(
          tokenAddress,
          tokenAmount,
          minimumETH
        )

        setMessage('Sell submitted. Waiting for confirmation...')

        await tx.wait()

        setMessage('Sell successful!')
      }

      setQuote('')
      setAmount('')

      await loadMarket()
      await loadTrades()

    } catch (err) {
      setError(
        err.shortMessage || err.message || 'Transaction failed'
      )
    } finally {
      setLoading(false)
    }
  }

  const filteredTokens = tokens.filter(token =>
    `${token.name} ${token.symbol} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  function PriceChart() {
    const values = chartPoints.map(point => point.price)

    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 1
    const range = max - min || max * 0.01 || 1

    const coordinates = chartPoints.map((point, index) => {
      const x = chartPoints.length === 1
        ? 50
        : 8 + index * (84 / (chartPoints.length - 1))

      const y = 88 - ((point.price - min) / range) * 72

      return `${x},${y}`
    }).join(' ')

    return (
      <div style={{
        background: '#0b1220',
        border: '1px solid #263143',
        borderRadius: 14,
        padding: 16,
        marginTop: 18
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap'
        }}>
          <strong>Price chart</strong>
          <span style={{ color: '#8995a8', fontSize: 12 }}>
            Live samples · 15 seconds
          </span>
        </div>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            width: '100%',
            height: 190,
            marginTop: 14,
            display: 'block',
            background: '#101a2a',
            borderRadius: 8
          }}
        >
          {[20, 40, 60, 80].map(y => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="#263143"
              strokeWidth="0.5"
            />
          ))}

          {chartPoints.length > 1 && (
            <polyline
              points={coordinates}
              fill="none"
              stroke="#d7a94b"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {chartPoints.length < 2 && (
          <p style={{ color: '#8995a8', fontSize: 13 }}>
            Collecting price samples. Keep this page open to build the chart.
          </p>
        )}

        <p style={{
          color: '#8995a8',
          fontSize: 11,
          marginBottom: 0
        }}>
          Last refreshed: {lastUpdated || 'Waiting for data'}
        </p>
      </div>
    )
  }

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

        {/* MARKET PAGE - EXISTING DESIGN PRESERVED */}

        {active === 'Market' && (
          <>
            <h2>Token Market</h2>
            <p>Discover tokens launched on GIWA.</p>

            <div style={{
              display: 'flex',
              gap: 10,
              margin: '25px 0'
            }}>
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
                <div
                  key={token.address}
                  style={{
                    background: '#111827',
                    border: '1px solid #263143',
                    borderRadius: 12,
                    padding: 20
                  }}
                >
                  <h3>{token.name} ({token.symbol})</h3>

                  {token.logo && (
                    <img
                      src={token.logo}
                      alt=""
                      style={{
                        width: 45,
                        height: 45,
                        borderRadius: '50%'
                      }}
                    />
                  )}

                  <p>Price: {token.price.toFixed(8)} ETH</p>
                  <p>Volume: {token.volume.toFixed(4)} ETH</p>
                  <p>Reserve: {token.reserve.toFixed(4)} ETH</p>
                  <p>Trading fee: {token.fee}%</p>

                  <p style={{
                    fontSize: 11,
                    overflowWrap: 'anywhere'
                  }}>
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

        {/* TRADE PAGE */}

        {active === 'Trade' && (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <div>
                <h2 style={{ marginBottom: 5 }}>Trade</h2>
                <p>GIWA bonding-curve trading</p>
              </div>

              <button
                className="wallet"
                onClick={() => {
                  loadMarket()
                  loadTrades()
                }}
              >
                Refresh data
              </button>
            </div>

            <div style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              margin: '18px 0'
            }}>
              <select
                value={tokenAddress}
                onChange={e => {
                  setTokenAddress(e.target.value)
                  setQuote('')
                  setChartPoints([])
                  setTrades([])
                }}
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: 13,
                  borderRadius: 8,
                  background: '#111827',
                  color: 'white',
                  border: '1px solid #263143'
                }}
              >
                <option value="">Select a launched token</option>

                {tokens.map(token => (
                  <option
                    key={token.address}
                    value={token.address}
                  >
                    {token.name} ({token.symbol})
                  </option>
                ))}
              </select>
            </div>

            {selectedToken ? (
              <>
                <div style={{
                  background: '#111827',
                  border: '1px solid #263143',
                  borderRadius: 14,
                  padding: 20
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 13
                  }}>
                    {selectedToken.logo ? (
                      <img
                        src={selectedToken.logo}
                        alt=""
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: '50%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <div style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: '#263143',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 22
                      }}>
                        ◈
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ margin: 0 }}>
                        {selectedToken.name}
                      </h2>
                      <span style={{ color: '#9aa6b8' }}>
                        {selectedToken.symbol}
                      </span>
                    </div>

                    <span style={{
                      color: '#55d6a1',
                      fontSize: 12
                    }}>
                      ● On-chain
                    </span>
                  </div>

                  <div style={{ marginTop: 22 }}>
                    <span style={{
                      color: '#9aa6b8',
                      fontSize: 13
                    }}>
                      Current token price
                    </span>

                    <h1 style={{
                      fontSize: 30,
                      margin: '5px 0',
                      color: '#d7a94b',
                      overflowWrap: 'anywhere'
                    }}>
                      {selectedToken.price.toFixed(10)} ETH
                    </h1>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))',
                    gap: 10,
                    marginTop: 20
                  }}>
                    {[
                      ['Market cap', selectedToken.marketCap.toFixed(6) + ' ETH'],
                      ['Total volume', selectedToken.volume.toFixed(6) + ' ETH'],
                      ['ETH reserve', selectedToken.reserve.toFixed(6) + ' ETH'],
                      ['Total supply', selectedToken.supply.toLocaleString()],
                      ['Trading fee', selectedToken.fee + '%'],
                      ['Price currency', 'ETH']
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          background: '#0b1220',
                          padding: 13,
                          borderRadius: 9,
                          border: '1px solid #263143',
                          minWidth: 0
                        }}
                      >
                        <div style={{
                          color: '#8995a8',
                          fontSize: 12,
                          marginBottom: 7
                        }}>
                          {label}
                        </div>

                        <strong style={{
                          fontSize: 14,
                          overflowWrap: 'anywhere'
                        }}>
                          {value}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <PriceChart />

                  <div style={{
                    marginTop: 15,
                    padding: 13,
                    background: '#0b1220',
                    borderRadius: 9
                  }}>
                    <div style={{
                      color: '#8995a8',
                      fontSize: 12
                    }}>
                      Token contract
                    </div>

                    <div style={{
                      fontSize: 12,
                      overflowWrap: 'anywhere',
                      marginTop: 6
                    }}>
                      {selectedToken.address}
                    </div>

                    <a
                      href={`${NETWORK.blockExplorerUrls[0]}/address/${selectedToken.address}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: '#d7a94b',
                        display: 'inline-block',
                        marginTop: 10,
                        fontSize: 13
                      }}
                    >
                      View on GIWA Explorer ↗
                    </a>
                  </div>
                </div>

                {/* BUY / SELL PANEL */}

                <div style={{
                  maxWidth: 600,
                  margin: '20px auto',
                  padding: 22,
                  background: '#111827',
                  border: '1px solid #263143',
                  borderRadius: 14
                }}>
                  <h2 style={{ marginTop: 0 }}>Swap</h2>

                  <div style={{
                    display: 'flex',
                    gap: 10,
                    marginBottom: 22
                  }}>
                    {['buy', 'sell'].map(type => (
                      <button
                        key={type}
                        className="wallet"
                        style={{
                          flex: 1,
                          background: tradeType === type
                            ? '#d7a94b'
                            : '#263143',
                          color: tradeType === type
                            ? '#080b12'
                            : 'white'
                        }}
                        onClick={() => {
                          setTradeType(type)
                          setQuote('')
                          setError('')
                          setMessage('')
                        }}
                      >
                        {type === 'buy' ? 'Buy' : 'Sell'}
                      </button>
                    ))}
                  </div>

                  <label>
                    {tradeType === 'buy'
                      ? 'You pay · ETH'
                      : `You sell · ${selectedToken.symbol}`}
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
                    placeholder={
                      tradeType === 'buy'
                        ? '0.1 ETH'
                        : '1000 tokens'
                    }
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: 15,
                      margin: '9px 0 18px',
                      borderRadius: 8,
                      background: '#080b12',
                      color: 'white',
                      border: '1px solid #263143',
                      fontSize: 16
                    }}
                  />

                  <button
                    className="wallet"
                    style={{
                      width: '100%',
                      marginBottom: 12
                    }}
                    onClick={getQuote}
                    disabled={loading}
                  >
                    Get Quote
                  </button>

                  {quote && (
                    <div style={{
                      background: '#0b1220',
                      padding: 14,
                      borderRadius: 8,
                      marginBottom: 14
                    }}>
                      <span style={{
                        color: '#9aa6b8',
                        fontSize: 12
                      }}>
                        Estimated output
                      </span>

                      <h3 style={{
                        color: '#d7a94b',
                        margin: '7px 0',
                        overflowWrap: 'anywhere'
                      }}>
                        {quote}
                      </h3>
                    </div>
                  )}

                  <button
                    className="wallet"
                    style={{ width: '100%' }}
                    onClick={executeTrade}
                    disabled={loading}
                  >
                    {loading
                      ? 'Processing...'
                      : !wallet
                        ? 'Connect wallet to trade'
                        : tradeType === 'buy'
                          ? 'Buy ' + selectedToken.symbol
                          : 'Approve & Sell'}
                  </button>

                  <p style={{
                    fontSize: 12,
                    color: '#aab3c2',
                    marginTop: 15
                  }}>
                    1% slippage protection is applied. Network gas fees are separate.
                  </p>
                </div>

                {/* REAL BLOCKCHAIN TRADE HISTORY */}

                <div style={{
                  background: '#111827',
                  border: '1px solid #263143',
                  borderRadius: 12,
                  padding: 18,
                  marginTop: 18
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10
                  }}>
                    <h3 style={{ marginTop: 0 }}>
                      Recent trades
                    </h3>

                    <button
                      className="wallet"
                      onClick={loadTrades}
                      disabled={tradesLoading}
                      style={{ padding: '8px 12px' }}
                    >
                      {tradesLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>

                  <p style={{
                    color: '#8995a8',
                    fontSize: 12,
                    marginBottom: 15
                  }}>
                    Latest 20 indexed events within the last 5,000 blocks.
                  </p>

                  {tradesLoading && (
                    <p>Loading blockchain trades...</p>
                  )}

                  {!tradesLoading && trades.length === 0 && (
                    <p style={{
                      color: '#9aa6b8',
                      fontSize: 13
                    }}>
                      No trade events found in the searched block range.
                    </p>
                  )}

                  {!tradesLoading && trades.map((trade, index) => (
                    <div
                      key={trade.transactionHash + index}
                      style={{
                        borderTop: '1px solid #263143',
                        padding: '14px 0',
                        display: 'grid',
                        gap: 7
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <strong style={{
                          color: trade.isBuy
                            ? '#55d6a1'
                            : '#ff7777'
                        }}>
                          {trade.isBuy ? 'BUY' : 'SELL'}
                        </strong>

                        <span style={{
                          color: '#8995a8',
                          fontSize: 11
                        }}>
                          Block {trade.blockNumber}
                        </span>
                      </div>

                      <div style={{
                        fontSize: 13,
                        overflowWrap: 'anywhere'
                      }}>
                        Trader: {trade.trader}
                      </div>

                      <div style={{
                        color: '#d7a94b',
                        fontSize: 13
                      }}>
                        {Number(trade.ethAmount).toFixed(6)} ETH
                      </div>

                      <div style={{
                        color: '#9aa6b8',
                        fontSize: 12
                      }}>
                        Tokens: {Number(trade.tokenAmount).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 6 }
                        )}
                      </div>

                      <a
                        href={`${NETWORK.blockExplorerUrls[0]}/tx/${trade.transactionHash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#d7a94b',
                          fontSize: 12,
                          textDecoration: 'none'
                        }}
                      >
                        View transaction ↗
                      </a>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{
                padding: 35,
                textAlign: 'center',
                background: '#111827',
                border: '1px solid #263143',
                borderRadius: 14
              }}>
                <h3>Select a token to start trading</h3>
                <p style={{ color: '#9aa6b8' }}>
                  Choose a launched token from the list above.
                </p>
              </div>
            )}
          </>
        )}

        {/* STAKE */}

        {active === 'Stake' && (
          <>
            <h2>Stake</h2>
            <p>Coming Soon</p>
          </>
        )}

        {/* OTHER PAGES - NOT YET IMPLEMENTED */}

        {!['Market', 'Trade', 'Stake'].includes(active) && (
          <>
            <h2>{active}</h2>
            <p>This feature is being built.</p>
          </>
        )}

        {message && (
          <p style={{
            color: '#d7a94b',
            marginTop: 20
          }}>
            {message}
          </p>
        )}

        {error && (
          <p style={{
            color: '#ff7777',
            marginTop: 20
          }}>
            {error}
          </p>
        )}

      </main>
    </div>
  )
}
