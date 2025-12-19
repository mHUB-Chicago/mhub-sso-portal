#!/bin/bash
TEMP_PRIVATE_KEY_FILE=$(mktemp)
TEMP_PUBLIC_CERT_FILE=$(mktemp)

openssl genrsa -out $TEMP_PRIVATE_KEY_FILE 2048
openssl req -new -x509 \
  -key $TEMP_PRIVATE_KEY_FILE \
  -out $TEMP_PUBLIC_CERT_FILE \
  -days 99999 \
  -subj "/CN=mHUB SAML Signing"

SAML_PRIVATE_KEY=$(awk '{printf "%s\\n", $0}' $TEMP_PRIVATE_KEY_FILE)
SAML_PUBLIC_CERT=$(awk '{printf "%s\\n", $0}' $TEMP_PUBLIC_CERT_FILE)

echo $SAML_PRIVATE_KEY
echo $SAML_PUBLIC_CERT
