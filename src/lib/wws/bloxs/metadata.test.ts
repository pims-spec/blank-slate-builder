import { describe, expect, it } from "vitest";
import { leesMetadata } from "./metadata";

const V4 = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="Bloxs.Feed" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Owner">
        <Key><PropertyRef Name="Reference"/></Key>
        <Property Name="Reference" Type="Edm.String" Nullable="false"/>
        <Property Name="Name" Type="Edm.String"/>
        <Property Name="Email" Type="Edm.String" DefaultValue="info@voorbeeld.nl"/>
        <NavigationProperty Name="Units" Type="Collection(Bloxs.Feed.Unit)"/>
      </EntityType>
      <EntityType Name="Unit">
        <Key><PropertyRef Name="UnitId"/></Key>
        <Property Name="UnitId" Type="Edm.Int64" Nullable="false"/>
        <Property Name="PostalCode" Type="Edm.String">
          <Annotation Term="Core.Description" String="Bijv. 1053 ZD Jan Jansen"/>
        </Property>
      </EntityType>
      <!-- <EntityType Name="Verborgen"><Property Name="Geheim"/></EntityType> -->
      <EntityContainer Name="Container">
        <EntitySet Name="Owners" EntityType="Bloxs.Feed.Owner"/>
        <EntitySet Name="Units" EntityType="Bloxs.Feed.Unit"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

describe("leesMetadata", () => {
  it("geeft alleen namen van sets, velden, sleutels en navigatie", () => {
    const s = leesMetadata(V4)!;
    expect(s.entiteiten).toEqual([
      {
        naam: "Owners",
        type: "Bloxs.Feed.Owner",
        sleutel: ["Reference"],
        velden: ["Reference", "Name", "Email"],
        navigatie: ["Units"],
      },
      {
        naam: "Units",
        type: "Bloxs.Feed.Unit",
        sleutel: ["UnitId"],
        velden: ["UnitId", "PostalCode"],
        navigatie: [],
      },
    ]);
  });

  it("geen waarden: standaardwaarden, annotaties en commentaar komen niet mee", () => {
    const tekst = JSON.stringify(leesMetadata(V4));
    expect(tekst).not.toContain("info@voorbeeld.nl");
    expect(tekst).not.toContain("Jan Jansen");
    expect(tekst).not.toContain("Geheim");
    expect(tekst).not.toContain("Verborgen");
  });

  it("OData v2 met namespace-prefixen en typen zonder set", () => {
    const v2 = `<edmx:Edmx Version="1.0" xmlns:edmx="x"><edmx:DataServices>
      <Schema Namespace="NS"><EntityType Name="Complex"><Key><PropertyRef Name="Id"/></Key>
      <Property Name="Id" Type="Edm.Int32"/><Property Name="Naam" Type="Edm.String"/></EntityType>
      </Schema></edmx:DataServices></edmx:Edmx>`;
    expect(leesMetadata(v2)!.entiteiten).toEqual([
      { naam: "Complex", type: "Complex", sleutel: ["Id"], velden: ["Id", "Naam"], navigatie: [] },
    ]);
  });

  it("namen die geen naam zijn worden overgeslagen", () => {
    const xml = `<Schema Namespace="N"><EntityType Name="T">
      <Property Name="Goed"/><Property Name="niet goed; 06-12345678"/><Property Name=""/>
      </EntityType></Schema>`;
    expect(leesMetadata(xml)!.entiteiten[0]!.velden).toEqual(["Goed"]);
  });

  it("geen CSDL → null", () => {
    expect(leesMetadata('{"value":[{"name":"Owners"}]}')).toBeNull();
    expect(leesMetadata("<html><body>Inloggen</body></html>")).toBeNull();
  });
});
