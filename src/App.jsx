
import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { connectWallet, CONTRACT_ADDRESS, NETWORK, ABI } from './contracts'

const sections = ['Market', 'Trade', 'Launch', 'Fundraise', 'Portfolio', 'Stake']

const tokenABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)'
]

export default function App() {
  const [active, setActive] = useState('Market')
  const [wallet, setWallet] = useState('')
  const [tokens, setTokens] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadMarket() {
    try {
      setLoading(true)
      setError('')

      const provider = new ethers.JsonRpcProvider(
        NETWORK.rpcUrls[0],
        Number(BigInt(NETWORK.chainId))
      )

      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        ABI,
        provider
      )

      const count = Number(await contract.tokenCount())
      const results = await Promise.all(
        Array.from({ length: count }, async (_, i) => {
          const address = await contract.tokenAt(i)
          const data = await contract.tokens(address)

          if (!data[7]) return null

          const tokenContract = new ethers.Contract(
            address,
            tokenABI,
            provider
          )

          const [name, symbol] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol()
          ])

          let logo = ''
          try {
            logo = await contract.tokenLogoURI(address)
          } catch {}

          return {
            address,
            name,
            symbol,
            logo,
            supply: ethers.formatUnits(data[1], 18),
            price: ethers.formatUnits(data[2], 18),
            volume: ethers.formatEther(data[5]),
            reserve: ethers.formatEther(data[4]),
            fee: Number(data[6]) / 100
          }
        })
      )

      setTokens(results.filter(Boolean).reverse())
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
    } catch (err) {
      setError(err.shortMessage || err.message || 'Wallet connection failed')
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
        <button className="wallet" onClick={handleConnect}>
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
            onClick={() => setActive(section)}
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
                placeholder="Search name, symbol or address..."
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

            {loading && <p>Loading launched tokens...</p>}

            {error && (
              <p style={{ color: '#ff7777', margin: '15px 0' }}>
                {error}
              </p>
            )}

            {!loading && filteredTokens.length === 0 && (
              <p>No launched tokens found.</p>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 16,
              marginTop: 20
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
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 18
                  }}>
                    {token.logo && (
                      <img
                        src={token.logo}
                        alt=""
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: '50%',
                          objectFit: 'cover'
                        }}
                      />
                    )}

                    <div>
                      <h3>{token.name}</h3>
                      <p>${token.symbol}</p>
                    </div>
                  </div>

                  <p>Price: {Number(token.price).toFixed(8)} ETH</p>
                  <p>Trading volume: {Number(token.volume).toFixed(4)} ETH</p>
                  <p>ETH reserve: {Number(token.reserve).toFixed(4)} ETH</p>
                  <p>Trading fee: {token.fee}%</p>

                  <p style={{
                    fontSize: 11,
                    overflowWrap: 'anywhere',
                    marginTop: 15
                  }}>
                    {token.address}
                  </p>

                  <a
                    href={`${NETWORK.blockExplorerUrls[0]}/address/${token.address}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#d7a94b', display: 'inline-block', marginTop: 12 }}
                  >
                    View on Explorer
                  </a>
                </div>
              ))}
            </div>
          </>
        )}

        {active === 'Stake' && (
          <>
            <h2>Stake</h2>
            <p>Coming Soon</p>
          </>
        )}

        {!['Market', 'Stake'].includes(active) && (
          <>
            <h2>{active}</h2>
            <p>This feature is being built. Please check back soon.</p>
          </>
        )}

        {error && active !== 'Market' && (
          <p style={{ color: '#ff7777', marginTop: 20 }}>{error}</p>
        )}
      </main>
    </div>
  )
}
