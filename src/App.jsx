
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
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)'
]

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 14,
  margin: '9px 0 18px',
  borderRadius: 8,
  background: '#080b12',
  color: 'white',
  border: '1px solid #263143',
  fontSize: 15
}

const cardStyle = {
  background: '#111827',
  border: '1px solid #263143',
  borderRadius: 12,
  padding: 20
}

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

  // Launch states
  const [launchName, setLaunchName] = useState('')
  const [launchSymbol, setLaunchSymbol] = useState('')
  const [launchLogo, setLaunchLogo] = useState('')
  const [launchSupply, setLaunchSupply] = useState('400000000')
  const [launchFee, setLaunchFee] = useState('100')
  const [creationFee, setCreationFee] = useState('')
  const [launching, setLaunching] = useState(false)

  // Fundraise and portfolio states
  const [fundraiseFee, setFundraiseFee] = useState('')
  const [portfolio, setPortfolio] = useState([])
  const [portfolioLoading, setPortfolioLoading] = useState(false)

  const provider = new ethers.JsonRpcProvider(
    NETWORK.rpcUrls[0],
    Number(BigInt(NETWORK.chainId))
  )

  const readContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    ABI,
    provider
  )

  // =====================================
  // MARKET
  // =====================================

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

          const price = Number(
            ethers.formatUnits(data[2], 18)
          )

          const volume = Number(
            ethers.formatEther(data[5])
          )

          const reserve = Number(
            ethers.formatEther(data[4])
          )

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

      return list

    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Could not load tokens'
      )
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMarket()
  }, [])

  const selectedToken = tokens.find(
    token =>
      token.address.toLowerCase() ===
      tokenAddress.toLowerCase()
  )

  // =====================================
  // WALLET
  // =====================================

  async function handleConnect() {
    try {
      setError('')
      setMessage('')

      const result = await connectWallet()

      setWallet(result.address)
      setMessage('Wallet connected successfully')

    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Wallet connection failed'
      )
    }
  }

  // =====================================
  // LAUNCH
  // =====================================

  async function loadCreationFee() {
    try {
      const fee = await readContract.instantCreationFee()

      setCreationFee(
        ethers.formatEther(fee)
      )
    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Could not load creation fee'
      )
    }
  }

  async function loadFundraiseFee() {
    try {
      const fee = await readContract.fundraiseCreationFee()

      setFundraiseFee(
        ethers.formatEther(fee)
      )
    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Could not load fundraise fee'
      )
    }
  }

  useEffect(() => {
    if (active === 'Launch') {
      loadCreationFee()
    }

    if (active === 'Fundraise') {
      loadFundraiseFee()
    }
  }, [active])

  async function createToken() {
    try {
      setError('')
      setMessage('')

      if (!wallet) {
        throw new Error('Connect your wallet first')
      }

      if (!launchName.trim()) {
        throw new Error('Enter token name')
      }

      if (!launchSymbol.trim()) {
        throw new Error('Enter token symbol')
      }

      if (launchName.length > 64) {
        throw new Error('Token name is too long')
      }

      if (launchSymbol.length > 16) {
        throw new Error('Token symbol is too long')
      }

      if (
        launchLogo.trim() &&
        !/^https?:\/\/\S+$/i.test(launchLogo.trim())
      ) {
        throw new Error('Enter a valid HTTP or HTTPS logo URL')
      }

      const supply = Number(launchSupply)
      const feeBps = Number(launchFee)

      if (
        !Number.isSafeInteger(supply) ||
        supply < 400000000 ||
        supply > 1000000000
      ) {
        throw new Error(
          'Supply must be between 400 million and 1 billion'
        )
      }

      if (![100, 200, 300].includes(feeBps)) {
        throw new Error('Select 1%, 2%, or 3% trading fee')
      }

      setLaunching(true)

      const connection = await connectWallet()

      setWallet(connection.address)

      const contract = connection.contract

      // Always retrieve the current on-chain fee.
      const fee = await contract.instantCreationFee()

      setCreationFee(ethers.formatEther(fee))

      // Check that the contract is not paused.
      const paused = await contract.paused()

      if (paused) {
        throw new Error('Launchpad is currently paused')
      }

      setMessage(
        'Please confirm token creation in MetaMask...'
      )

      const tx = await contract.createInstant(
        launchName.trim(),
        launchSymbol.trim(),
        launchLogo.trim(),
        ethers.parseUnits(String(supply), 18),
        feeBps,
        { value: fee }
      )

      setMessage(
        'Transaction submitted. Waiting for confirmation...'
      )

      await tx.wait()

      setMessage(
        'Token created successfully! Refreshing Market...'
      )

      // Load the new token from the blockchain.
      const updatedTokens = await loadMarket()

      if (updatedTokens.length > 0) {
        setTokenAddress(updatedTokens[0].address)
      }

      setLaunchName('')
      setLaunchSymbol('')
      setLaunchLogo('')
      setLaunchSupply('400000000')
      setLaunchFee('100')

      setActive('Market')

      setMessage(
        'Congratulations! Your token has been created and listed.'
      )

    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Token creation failed'
      )
    } finally {
      setLaunching(false)
    }
  }

  // =====================================
  // LIVE PRICE CHART
  // =====================================

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

        setChartPoints(previous => [
          ...previous,
          {
            time: Date.now(),
            price
          }
        ].slice(-40))

        setLastUpdated(
          new Date().toLocaleTimeString()
        )

      } catch (err) {
        console.error('Price update error:', err)
      }
    }

    refreshPrice()

    const timer = setInterval(
      refreshPrice,
      15000
    )

    return () => {
      mounted = false
      clearInterval(timer)
    }

  }, [active, tokenAddress])

  // =====================================
  // TRADE HISTORY
  // =====================================

  async function loadTrades() {
    if (!ethers.isAddress(tokenAddress)) {
      setTrades([])
      return
    }

    try {
      setTradesLoading(true)

      const latestBlock = await provider.getBlockNumber()

      const fromBlock = Math.max(
        0,
        latestBlock - 5000
      )

      const filter = readContract.filters.Trade(
        tokenAddress
      )

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

  useEffect(() => {
    if (
      active === 'Trade' &&
      ethers.isAddress(tokenAddress)
    ) {
      loadTrades()
    } else {
      setTrades([])
    }
  }, [active, tokenAddress])

  // =====================================
  // QUOTES
  // =====================================

  async function getQuote() {
    try {
      setError('')
      setMessage('')
      setQuote('')

      if (!ethers.isAddress(tokenAddress)) {
        throw new Error('Select a valid token')
      }

      if (!amount || !Number.isFinite(Number(amount)) ||
          Number(amount) <= 0) {
        throw new Error('Enter a valid amount')
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
        const tokenAmount = ethers.parseUnits(
          amount,
          18
        )

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
        err.shortMessage ||
        err.message ||
        'Quote failed'
      )
    }
  }

  // =====================================
  // BUY AND SELL
  // =====================================

  async function executeTrade() {
    try {
      setError('')
      setMessage('')

      if (!wallet) {
        throw new Error('Connect your wallet first')
      }

      if (!ethers.isAddress(tokenAddress)) {
        throw new Error('Select a valid token')
      }

      if (!amount || !Number.isFinite(Number(amount)) ||
          Number(amount) <= 0) {
        throw new Error('Enter a valid amount')
      }

      setLoading(true)

      const connection = await connectWallet()

      setWallet(connection.address)

      const contract = connection.contract

      if (tradeType === 'buy') {
        const ethAmount = ethers.parseEther(amount)

        const quotedTokens = await contract.quoteBuy(
          tokenAddress,
          ethAmount
        )

        const minimumTokens =
          quotedTokens * 99n / 100n

        setMessage(
          'Confirm your buy transaction in MetaMask...'
        )

        const tx = await contract.buy(
          tokenAddress,
          minimumTokens,
          { value: ethAmount }
        )

        setMessage(
          'Buy submitted. Waiting for confirmation...'
        )

        await tx.wait()

        setMessage('Buy successful!')

      } else {
        const tokenAmount = ethers.parseUnits(
          amount,
          18
        )

        const quotedETH = await contract.quoteSell(
          tokenAddress,
          tokenAmount
        )

        const minimumETH =
          quotedETH * 99n / 100n

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

        setMessage(
          'Sell submitted. Waiting for confirmation...'
        )

        await tx.wait()

        setMessage('Sell successful!')
      }

      setQuote('')
      setAmount('')

      await loadMarket()
      await loadTrades()

    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Transaction failed'
      )
    } finally {
      setLoading(false)
    }
  }

  // =====================================
  // PORTFOLIO
  // =====================================

  async function loadPortfolio() {
    if (!wallet) {
      setError('Connect your wallet first')
      return
    }

    try {
      setPortfolioLoading(true)
      setError('')

      const results = await Promise.all(
        tokens.map(async token => {
          const contract = new ethers.Contract(
            token.address,
            tokenABI,
            provider
          )

          const balance = await contract.balanceOf(wallet)

          return {
            ...token,
            balance: Number(
              ethers.formatUnits(balance, 18)
            )
          }
        })
      )

      setPortfolio(
        results.filter(item => item.balance > 0)
      )

    } catch (err) {
      setError(
        err.shortMessage ||
        err.message ||
        'Could not load portfolio'
      )
    } finally {
      setPortfolioLoading(false)
    }
  }

  useEffect(() => {
    if (active === 'Portfolio' && wallet) {
      loadPortfolio()
    }
  }, [active, wallet, tokens])

  // =====================================
  // FILTER MARKET TOKENS
  // =====================================

  const filteredTokens = tokens.filter(token =>
    `${token.name} ${token.symbol} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  // =====================================
  // PRICE CHART
  // =====================================

  function PriceChart() {
    const values = chartPoints.map(
      point => point.price
    )

    const min = values.length
      ? Math.min(...values)
      : 0

    const max = values.length
      ? Math.max(...values)
      : 1

    const range = max - min || max * 0.01 || 1

    const coordinates = chartPoints.map(
      (point, index) => {
        const x = chartPoints.length === 1
          ? 50
          : 8 + index * (
              84 / (chartPoints.length - 1)
            )

        const y = 88 - (
          (point.price - min) / range
        ) * 72

        return `${x},${y}`
      }
    ).join(' ')

    return (
      <div style={{
        ...cardStyle,
        marginTop: 18
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <strong>Price Chart</strong>
          <span style={{
            color: '#8995a8',
            fontSize: 12
          }}>
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
          <p style={{
            color: '#8995a8',
            fontSize: 13
          }}>
            Collecting price samples. Keep this page open.
          </p>
        )}

        <p style={{
          color: '#8995a8',
          fontSize: 11,
          marginBottom: 0
        }}>
          Last updated: {lastUpdated || 'Waiting...'}
        </p>
      </div>
    )
  }

  // =====================================
  // MAIN WEBSITE
  // =====================================

  return (
    <div className="app">

      <header className="header">
        <h1>
          GIWA <span>LAUNCHPAD</span>
        </h1>

        <button
          className="wallet"
          onClick={handleConnect}
          disabled={loading || launching}
        >
          {wallet
            ? wallet.slice(0, 6) +
              '...' +
              wallet.slice(-4)
            : 'Connect Wallet'}
        </button>
      </header>

      <nav className="nav">
        {sections.map(section => (
          <button
            key={section}
            className={
              active === section ? 'active' : ''
            }
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

        {/* MARKET */}

        {active === 'Market' && (
          <>
            <h2>Token Market</h2>

            <p>
              Discover tokens launched on GIWA.
            </p>

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
                  ...inputStyle,
                  flex: 1,
                  minWidth: 0,
                  margin: 0
                }}
              />

              <button
                className="wallet"
                onClick={loadMarket}
              >
                Refresh
              </button>
            </div>

            {loading && <p>Loading tokens...</p>}

            {filteredTokens.length === 0 &&
              !loading && (
                <p>No launched tokens found.</p>
              )}

            <div style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(250px,1fr))',
              gap: 16
            }}>
              {filteredTokens.map(token => (
                <div
                  key={token.address}
                  style={cardStyle}
                >
                  <h3>
                    {token.name} ({token.symbol})
                  </h3>

                  {token.logo && (
                    <img
                      src={token.logo}
                      alt=""
                      style={{
                        width: 45,
                        height: 45,
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                  )}

                  <p>
                    Price: {token.price.toFixed(8)} ETH
                  </p>

                  <p>
                    Market cap: {token.marketCap.toFixed(6)} ETH
                  </p>

                  <p>
                    Volume: {token.volume.toFixed(4)} ETH
                  </p>

                  <p>
                    Reserve: {token.reserve.toFixed(4)} ETH
                  </p>

                  <p>
                    Trading fee: {token.fee}%
                  </p>

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

        {/* TRADE */}

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
                <h2 style={{ marginBottom: 5 }}>
                  Trade
                </h2>
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

            <div style={{ margin: '18px 0' }}>
              <select
                value={tokenAddress}
                onChange={e => {
                  setTokenAddress(e.target.value)
                  setQuote('')
                  setChartPoints([])
                  setTrades([])
                }}
                style={inputStyle}
              >
                <option value="">
                  Select a launched token
                </option>

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
                <div style={cardStyle}>
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

                    <div style={{
                      flex: 1,
                      minWidth: 0
                    }}>
                      <h2 style={{ margin: 0 }}>
                        {selectedToken.name}
                      </h2>

                      <span style={{
                        color: '#9aa6b8'
                      }}>
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
                    gridTemplateColumns:
                      'repeat(auto-fit,minmax(135px,1fr))',
                    gap: 10,
                    marginTop: 20
                  }}>
                    {[
                      [
                        'Market cap',
                        selectedToken.marketCap.toFixed(6) + ' ETH'
                      ],
                      [
                        'Total volume',
                        selectedToken.volume.toFixed(6) + ' ETH'
                      ],
                      [
                        'ETH reserve',
                        selectedToken.reserve.toFixed(6) + ' ETH'
                      ],
                      [
                        'Total supply',
                        selectedToken.supply.toLocaleString()
                      ],
                      [
                        'Trading fee',
                        selectedToken.fee + '%'
                      ],
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
                      href={
                        `${NETWORK.blockExplorerUrls[0]}/address/${selectedToken.address}`
                      }
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

                {/* SWAP PANEL */}

                <div style={{
                  maxWidth: 600,
                  margin: '20px auto',
                  padding: 22,
                  background: '#111827',
                  border: '1px solid #263143',
                  borderRadius: 14
                }}>
                  <h2 style={{ marginTop: 0 }}>
                    Swap
                  </h2>

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
                          background:
                            tradeType === type
                              ? '#d7a94b'
                              : '#263143',
                          color:
                            tradeType === type
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
                    style={inputStyle}
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
                    1% slippage protection is applied.
                    Network gas fees are separate.
                  </p>
                </div>

                {/* TRADE HISTORY */}

                <div style={{
                  ...cardStyle,
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
                      {tradesLoading
                        ? 'Loading...'
                        : 'Refresh'}
                    </button>
                  </div>

                  <p style={{
                    color: '#8995a8',
                    fontSize: 12
                  }}>
                    Latest 20 events within the last 5,000 blocks.
                  </p>

                  {tradesLoading && (
                    <p>Loading blockchain trades...</p>
                  )}

                  {!tradesLoading &&
                    trades.length === 0 && (
                      <p style={{
                        color: '#9aa6b8',
                        fontSize: 13
                      }}>
                        No trade events found.
                      </p>
                    )}

                  {!tradesLoading && trades.map(
                    (trade, index) => (
                      <div
                        key={
                          trade.transactionHash + index
                        }
                        style={{
                          borderTop: '1px solid #263143',
                          padding: '14px 0',
                          display: 'grid',
                          gap: 7
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between'
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
                          {Number(
                            trade.ethAmount
                          ).toFixed(6)} ETH
                        </div>

                        <div style={{
                          color: '#9aa6b8',
                          fontSize: 12
                        }}>
                          Tokens: {
                            Number(
                              trade.tokenAmount
                            ).toLocaleString(
                              undefined,
                              { maximumFractionDigits: 6 }
                            )
                          }
                        </div>

                        <a
                          href={
                            `${NETWORK.blockExplorerUrls[0]}/tx/${trade.transactionHash}`
                          }
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
                    )
                  )}
                </div>
              </>
            ) : (
              <div style={{
                padding: 35,
                textAlign: 'center',
                ...cardStyle
              }}>
                <h3>Select a token to start trading</h3>

                <p style={{ color: '#9aa6b8' }}>
                  Choose a launched token from the list.
                </p>
              </div>
            )}
          </>
        )}

        {/* LAUNCH */}

        {active === 'Launch' && (
          <>
            <h2>Launch Your Token</h2>

            <p>
              Create your own token instantly on GIWA.
            </p>

            <div style={{
              maxWidth: 550,
              margin: '20px auto',
              padding: 22,
              ...cardStyle
            }}>
              <h3>Token Information</h3>

              <label>Token Name</label>

              <input
                value={launchName}
                onChange={e =>
                  setLaunchName(e.target.value)
                }
                placeholder="My Token"
                maxLength={64}
                style={inputStyle}
              />

              <label>Token Symbol</label>

              <input
                value={launchSymbol}
                onChange={e =>
                  setLaunchSymbol(e.target.value)
                }
                placeholder="MTK"
                maxLength={16}
                style={inputStyle}
              />

              <label>Token Logo URL (optional)</label>

              <input
                value={launchLogo}
                onChange={e =>
                  setLaunchLogo(e.target.value)
                }
                placeholder="https://example.com/logo.png"
                style={inputStyle}
              />

              {launchLogo && (
                <div style={{ marginBottom: 18 }}>
                  <p style={{
                    color: '#8995a8',
                    fontSize: 12
                  }}>
                    Logo preview
                  </p>

                  <img
                    src={launchLogo}
                    alt="Token logo preview"
                    onError={e => {
                      e.currentTarget.style.display = 'none'
                    }}
                    style={{
                      width: 60,
                      height: 60,
                      objectFit: 'cover',
                      borderRadius: '50%'
                    }}
                  />
                </div>
              )}

              <label>Total Token Supply</label>

              <select
                value={launchSupply}
                onChange={e =>
                  setLaunchSupply(e.target.value)
                }
                style={inputStyle}
              >
                <option value="400000000">400 Million</option>
                <option value="500000000">500 Million</option>
                <option value="600000000">600 Million</option>
                <option value="700000000">700 Million</option>
                <option value="800000000">800 Million</option>
                <option value="900000000">900 Million</option>
                <option value="1000000000">1 Billion</option>
              </select>

              <label>Trading Fee</label>

              <select
                value={launchFee}
                onChange={e =>
                  setLaunchFee(e.target.value)
                }
                style={inputStyle}
              >
                <option value="100">1%</option>
                <option value="200">2%</option>
                <option value="300">3%</option>
              </select>

              <div style={{
                background: '#0b1220',
                padding: 16,
                borderRadius: 9,
                margin: '15px 0'
              }}>
                <h3 style={{
                  color: '#d7a94b',
                  marginTop: 0
                }}>
                  Launch Summary
                </h3>

                <p>
                  Creation fee: <strong>
                    {creationFee !== ''
                      ? creationFee + ' ETH'
                      : 'Loading...'}
                  </strong>
                </p>

                <p>
                  Virtual liquidity: <strong>5 ETH</strong>
                </p>

                <p>
                  Supply: <strong>
                    {Number(
                      launchSupply
                    ).toLocaleString()}
                  </strong>
                </p>

                <p>
                  Trading fee: <strong>
                    {Number(launchFee) / 100}%
                  </strong>
                </p>
              </div>

              <button
                className="wallet"
                style={{
                  width: '100%',
                  padding: 15
                }}
                onClick={createToken}
                disabled={launching || loading}
              >
                {launching
                  ? 'Creating Token...'
                  : 'Create Token'}
              </button>

              <button
                className="wallet"
                style={{
                  width: '100%',
                  marginTop: 10,
                  background: '#263143'
                }}
                onClick={loadCreationFee}
                disabled={launching}
              >
                Refresh Creation Fee
              </button>

              <p style={{
                fontSize: 12,
                color: '#8995a8',
                marginTop: 16
              }}>
                Your wallet will request confirmation
                before the token is created. Network gas
                fees are separate.
              </p>
            </div>
          </>
        )}

        {/* FUNDRAISE */}

        {active === 'Fundraise' && (
          <>
            <h2>Fundraise</h2>

            <p>
              Create and participate in token fundraising.
            </p>

            <div style={{
              ...cardStyle,
              maxWidth: 550,
              margin: '20px auto'
            }}>
              <h3>Fundraise Launchpad</h3>

              <p>
                Current fundraise creation fee:
                {' '}
                <strong>
                  {fundraiseFee !== ''
                    ? fundraiseFee + ' ETH'
                    : 'Loading...'}
                </strong>
              </p>

              <button
                className="wallet"
                onClick={loadFundraiseFee}
              >
                Refresh Fundraise Fee
              </button>

              <p style={{
                color: '#d7a94b',
                marginTop: 18
              }}>
                Fundraise creation and contribution
                functions are not connected yet.
              </p>
            </div>
          </>
        )}

        {/* PORTFOLIO */}

        {active === 'Portfolio' && (
          <>
            <h2>My Portfolio</h2>

            <p>
              Your GIWA Launchpad token balances.
            </p>

            <button
              className="wallet"
              onClick={loadPortfolio}
              disabled={portfolioLoading}
            >
              {portfolioLoading
                ? 'Loading...'
                : 'Refresh Portfolio'}
            </button>

            {!wallet && (
              <p>Connect your wallet to view your portfolio.</p>
            )}

            {wallet && portfolio.length === 0 &&
              !portfolioLoading && (
                <p>No token holdings found.</p>
              )}

            <div style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit,minmax(250px,1fr))',
              gap: 16,
              marginTop: 20
            }}>
              {portfolio.map(token => (
                <div
                  key={token.address}
                  style={cardStyle}
                >
                  <h3>
                    {token.name} ({token.symbol})
                  </h3>

                  <h2 style={{
                    color: '#d7a94b'
                  }}>
                    {token.balance.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 6 }
                    )}
                  </h2>

                  <p>
                    Balance value estimate:
                    {' '}
                    {(token.balance * token.price).toFixed(6)} ETH
                  </p>

                  <button
                    className="wallet"
                    onClick={() => {
                      setTokenAddress(token.address)
                      setActive('Trade')
                    }}
                  >
                    Trade token
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* STAKE */}

        {active === 'Stake' && (
          <>
            <h2>Stake</h2>

            <div style={{
              ...cardStyle,
              textAlign: 'center',
              padding: 35
            }}>
              <h2 style={{
                color: '#d7a94b'
              }}>
                Coming Soon
              </h2>

              <p>
                GIWA staking functionality will be
                available in a future update.
              </p>
            </div>
          </>
        )}

        {/* STATUS MESSAGES */}

        {message && (
          <div style={{
            color: '#d7a94b',
            marginTop: 20,
            padding: 12,
            background: '#111827',
            borderRadius: 8,
            overflowWrap: 'anywhere'
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{
            color: '#ff7777',
            marginTop: 20,
            padding: 12,
            background: '#111827',
            borderRadius: 8,
            overflowWrap: 'anywhere'
          }}>
            {error}
          </div>
        )}

      </main>
    </div>
  )
}
