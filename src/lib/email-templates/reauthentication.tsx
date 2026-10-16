import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Je verificatiecode</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>GoHome <span style={brandSmall}>advice</span></Text>
        <Heading style={h1}>Bevestig je identiteit</Heading>
        <Text style={text}>Gebruik de onderstaande code om je identiteit te bevestigen:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Deze code is tijdelijk geldig. Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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

const codeStyle = { fontFamily: "Courier, monospace", fontSize: "28px", fontWeight: "bold" as const, color: "#0A0A1A", margin: "0 0 30px" }
