import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Herstel je wachtwoord voor {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>GoHome <span style={brandSmall}>advice</span></Text>
        <Heading style={h1}>Herstel je wachtwoord</Heading>
        <Text style={text}>
          We hebben een verzoek ontvangen om je wachtwoord te herstellen voor {siteName}. Klik op de knop hieronder om een nieuw wachtwoord te kiezen.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Nieuw wachtwoord kiezen
        </Button>
        <Text style={footer}>
          Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren. Je wachtwoord blijft ongewijzigd.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '520px' }
const brand = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0A0A1A', letterSpacing: '0', margin: '0 0 28px' }
const brandSmall = { fontSize: '14px', color: '#5C5C7A' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0A0A1A',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#5C5C7A',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#5B41FF',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #5B41FF',
  borderRadius: '14px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #8B78FF !important; color: #0A0A1A !important; }
  }
  [data-ogsc] .dm-btn { background-color: #8B78FF !important; color: #0A0A1A !important; }
  [data-ogsb] .dm-btn { background-color: #8B78FF !important; color: #0A0A1A !important; }
`
