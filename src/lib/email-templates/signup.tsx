import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Bevestig je e-mailadres voor {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>GoHome <span style={brandSmall}>advice</span></Text>
        <Heading style={h1}>Bevestig je e-mailadres</Heading>
        <Text style={text}>
          Bedankt voor je aanmelding bij{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Bevestig je e-mailadres (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) met de knop hieronder:
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          E-mailadres bevestigen
        </Button>
        <Text style={footer}>
          Heb je geen account aangemaakt? Dan kun je deze e-mail negeren.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
