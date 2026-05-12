import { useState } from 'react'
import HomeScreen from './HomeScreen'
import SendingScreen from './SendingScreen'
import AcknowledgedScreen from './AcknowledgedScreen'

export default function VictimApp() {
  const [screen, setScreen] = useState('home')
  const [result, setResult] = useState(null) // { sos, assignment }
  const [report, setReport] = useState(null)

  return (
    <div className="h-full">
      {screen === 'home' && (
        <HomeScreen
          onSend={(nextReport) => {
            setReport(nextReport)
            setScreen('sending')
          }}
        />
      )}
      {screen === 'sending' && (
        <SendingScreen
          report={report}
          onAck={(data) => { setResult(data); setScreen('acknowledged') }}
        />
      )}
      {screen === 'acknowledged' && (
        <AcknowledgedScreen
          result={result}
          onReset={() => { setResult(null); setReport(null); setScreen('home') }}
        />
      )}
    </div>
  )
}
