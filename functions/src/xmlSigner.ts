import { SignedXml } from 'xml-crypto';
import type { CertificadoInfo } from './certificado';

export function assinarXml(xml: string, certInfo: CertificadoInfo): string {
  const sig = new SignedXml({
    privateKey: certInfo.keyPem,
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  });

  sig.addReference({
    xpath: '//*[local-name()="evtRemun" or local-name()="evtPgtos" or local-name()="evtFechaEvPer" or local-name()="evtAdmissao" or local-name()="evtDeslig" or local-name()="evtTSVInicio"]',
    transforms: [
      'http://www.w3.org/2001/10/xml-exc-c14n#',
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });

  sig.computeSignature(xml, {
    location: {
      reference: '//*[local-name()="eSocial"]',
      action: 'append',
    },
  });

  let signedXml = sig.getSignedXml();

  const certDer = certInfo.certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');

  signedXml = signedXml.replace(
    '</SignatureValue>',
    `</SignatureValue><KeyInfo><X509Data><X509Certificate>${certDer}</X509Certificate></X509Data></KeyInfo>`,
  );

  return signedXml;
}

export function assinarLote(loteXml: string, certInfo: CertificadoInfo): string {
  const sig = new SignedXml({
    privateKey: certInfo.keyPem,
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  });

  sig.addReference({
    xpath: '//*[local-name()="envioLoteEventos"]',
    transforms: [
      'http://www.w3.org/2001/10/xml-exc-c14n#',
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });

  sig.computeSignature(loteXml, {
    location: {
      reference: '//*[local-name()="eSocial"]',
      action: 'append',
    },
  });

  return sig.getSignedXml();
}
