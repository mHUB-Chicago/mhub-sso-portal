1. Get SAMLRequest query param: https://member.mhubchicago.com/login/sso/start?route=https://large-sunfish-guided.ngrok-free.app/saml
2. URL decode: https://www.urldecoder.org/
3. B64 decode + Deflate: https://www.samltool.com/decode.php

<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  ID="_65df944b-7659-419f-949f-cb80e2e27fe2"
  Version="2.0"
  IssueInstant="2025-12-19T15:00:55Z"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
  AssertionConsumerServiceURL="https://member.mhubchicago.com/login/sso"
>
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    https://member.mhubchicago.com/
  </saml:Issuer>
  <samlp:NameIDPolicy Format="urn:clareity:safemls:nameid-format:loginid"/>
</samlp:AuthnRequest>
