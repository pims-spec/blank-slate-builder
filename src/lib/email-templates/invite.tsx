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
  Section,
  Text,
} from '@react-email/components'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  recipient?: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  recipient,
}: InviteEmailProps) => (
  <Html lang="nl" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Welkom bij {siteName} — inzicht in punten, huur en woningoptimalisatie.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
        <Text style={brand}>
          GoHome <span style={brandSmall}>advice</span>
        </Text>
        </Section>
        <Section style={content}>
        <Heading style={h1}>Welkom bij {siteName}</Heading>
        <Text style={text}>
          Een beheerder heeft je uitgenodigd voor{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Hiermee krijg je inzicht in WWS-punten, de maximale huurprijs en
          mogelijkheden om woningen en vastgoedportefeuilles te optimaliseren.
        </Text>
        <Heading as="h2" style={h2}>Wat je ermee kunt:</Heading>
        <ul style={list}>
          <li style={listItem}>WWS-punten en de maximale huurprijs van een woning berekenen.</li>
          <li style={listItem}>Tellingen opslaan met versies en overzichtelijke PDF-rapporten downloaden.</li>
          <li style={listItem}>Verbetermaatregelen vergelijken, met inzicht in kosten en het effect op punten en huur.</li>
          <li style={listItem}>Indelingsadvies bekijken om de mogelijkheden van een woning te onderzoeken.</li>
          <li style={listItem}>Energielabels en verduurzamingsmogelijkheden van vastgoedportefeuilles analyseren.</li>
          <li style={listItem}>Tellingen delen en samenwerken met je collega’s.</li>
        </ul>
        <Text style={note}>Welke onderdelen je kunt bekijken of aanpassen, hangt af van de rol die je beheerder je geeft.</Text>
        <Text style={text}>
          {recipient ? <>Je gebruikersnaam is je e-mailadres: <strong>{recipient}</strong>. </> : null}
          Klik hieronder om je wachtwoord in te stellen en aan de slag te gaan.
        </Text>
        <Section style={action}>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Wachtwoord instellen
        </Button>
        </Section>
        <Text style={footer}>
          Je ontvangt deze e-mail omdat een beheerder je heeft uitgenodigd voor {siteName}.
          Verwachtte je deze uitnodiging niet? Dan kun je deze e-mail negeren.
        </Text>
        <Text style={footerLink}>
          Werkt de knop niet? <Link href={confirmationUrl} style={fallbackLink}>Open je uitnodiging via deze link.</Link>
        </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '560px', border: '1px solid #E5E5EA', borderRadius: '8px', overflow: 'hidden' as const }
const header = { backgroundColor: '#5B41FF', padding: '26px 32px' }
const content = { padding: '30px 32px' }
const brand = { fontSize: '26px', fontWeight: 'bold' as const, color: '#ffffff', letterSpacing: '0', margin: '0' }
const brandSmall = { fontSize: '16px', color: '#ffffff' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1d1d1f',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: '#6b7280',
  lineHeight: '1.6',
  margin: '0 0 22px',
}
const h2 = { fontSize: '16px', color: '#1d1d1f', margin: '0 0 12px', fontWeight: 'bold' as const }
const list = { paddingLeft: '20px', margin: '0 0 20px', color: '#6b7280', fontSize: '15px', lineHeight: '1.6' }
const listItem = { marginBottom: '8px', paddingLeft: '2px' }
const note = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '0 0 22px' }
const action = { textAlign: 'center' as const }
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#5B41FF',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #5B41FF',
  borderRadius: '8px',
  padding: '14px 24px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#6b7280', lineHeight: '1.6', margin: '28px 0 0' }
const footerLink = { ...footer, margin: '8px 0 0' }
const fallbackLink = { color: '#5B41FF', textDecoration: 'underline' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #8B78FF !important; color: #1d1d1f !important; }
  }
  [data-ogsc] .dm-btn { background-color: #8B78FF !important; color: #1d1d1f !important; }
  [data-ogsb] .dm-btn { background-color: #8B78FF !important; color: #1d1d1f !important; }
`
