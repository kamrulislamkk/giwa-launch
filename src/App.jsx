
import React, { useState } from 'react'

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

  return (
    <div className="app">
      <header className="header">
        <h1>GIWA <span>LAUNCHPAD</span></h1>
        <button className="wallet">Connect Wallet</button>
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
      </main>
    </div>
  )
}
