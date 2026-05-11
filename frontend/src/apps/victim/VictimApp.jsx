import { useState } from 'react'
import HomeScreen from './HomeScreen'
import SendingScreen from './SendingScreen'
import AcknowledgedScreen from './AcknowledgedScreen'

const SCREENS = { home: 'home', sending: 'sending', acknowledged: 'acknowledged' }

export default function VictimApp() {
  const [screen, setScreen] = useState(SCREENS.home)

  return (
    <div className="h-full">
      {screen === SCREENS.home && (
        <HomeScreen onSend={() => setScreen(SCREENS.sending)} />
      )}
      {screen === SCREENS.sending && (
        <SendingScreen onAck={() => setScreen(SCREENS.acknowledged)} />
      )}
      {screen === SCREENS.acknowledged && (
        <AcknowledgedScreen onReset={() => setScreen(SCREENS.home)} />
      )}
    </div>
  )
}
