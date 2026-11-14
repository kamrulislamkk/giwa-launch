
import React, { useState } from 'react'
import { connectWallet } from './contracts'

const sections = [
  'Market',
  'Trade',
  'Launch',
  'Fundraise',
  'Portfolio',
  'Stake'
]

export default function App() {
  const [active, setActive] = useState('Market')
  const [wallet, setWallet] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    try {
      setLoading(true)
      setError('')
      const result = await connectWallet()
      setWallet(result.address)
    } catch (err) {
      setError(err.shortMessage || err.message || 'Wallet connection failed')
    } finally {
      setLoading(false)
    }
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
          {loading
            ? 'Connecting...'
            : wallet
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
        <h2>{active}</h2>

        {active === 'Stake' ? (
          <p>Coming Soon</p>
        ) : (
          <p>Welcome to GIWA LAUNCHPAD.</p>
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
