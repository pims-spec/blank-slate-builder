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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Je inloglink voor {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>GoHome <span style={brandSmall}>advice</span></Text>
        <Heading style={h1}>Je inloglink</Heading>
        <Text style={text}>
          Klik op de knop hieronder om in te loggen bij {siteName}. Deze link is tijdelijk geldig.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Inloggen
        </Button>
        <Text style={footer}>
          Heb je deze link niet aangevraagd? Dan kun je deze e-mail negeren.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '520px' }
const brand = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1d1d1f', letterSpacing: '0', margin: '0 0 28px' }
const brandSmall = { fontSize: '14px', color: '#6b7280' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1d1d1f',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#6b7280',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#5B41FF',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #5B41FF',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #8B78FF !important; color: #1d1d1f !important; }
  }
  [data-ogsc] .dm-btn { background-color: #8B78FF !important; color: #1d1d1f !important; }
  [data-ogsb] .dm-btn { background-color: #8B78FF !important; color: #1d1d1f !important; }
`
