import { useState } from 'react'
import HomeScreen from './HomeScreen'
import SendingScreen from './SendingScreen'
import AcknowledgedScreen from './AcknowledgedScreen'

export default function VictimApp() {
  const [screen, setScreen] = useState('home')
  const [result, setResult] = useState(null) // { sos, assignment }

  return (
    <div className="h-full">
      {screen === 'home' && (
        <HomeScreen onSend={() => setScreen('sending')} />
      )}
      {screen === 'sending' && (
        <SendingScreen
          onAck={(data) => { setResult(data); setScreen('acknowledged') }}
        />
      )}
      {screen === 'acknowledged' && (
        <AcknowledgedScreen
          result={result}
          onReset={() => { setResult(null); setScreen('home') }}
        />
      )}
    </div>
  )
}
