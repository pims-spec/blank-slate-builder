import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { InviteEmail } from './invite'

const props = {
  siteName: 'GoHome advice',
  siteUrl: 'https://gohome-advice.lovable.app',
  confirmationUrl: 'https://gohome-advice.lovable.app/uitnodiging',
}

describe('Uitnodigingsmail', () => {
  it('toont functies, rolbeperking, gebruikersnaam en de uitnodigingslink', async () => {
    const html = await render(<InviteEmail {...props} recipient="collega@example.test" />)
    for (const text of ['Welkom bij GoHome advice', 'WWS-punten', 'PDF-rapporten', 'Verbetermaatregelen', 'Indelingsadvies', 'Energielabels', 'Tellingen delen', 'hangt af van de rol', 'collega@example.test', 'Wachtwoord instellen']) {
      expect(html).toContain(text)
    }
    expect(html).toContain(`href="${props.confirmationUrl}"`)
    expect(html).toContain('lang="nl"')
  })

  it('blijft bruikbaar zonder ontvangergegevens en ontsnapt persoonsgegevens', async () => {
    expect(await render(<InviteEmail {...props} />)).not.toContain('Je gebruikersnaam')
    const html = await render(<InviteEmail {...props} recipient="<script>test</script>" />)
    expect(html).not.toContain('<script>test</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})