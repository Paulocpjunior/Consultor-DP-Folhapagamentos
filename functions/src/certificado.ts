import * as admin from 'firebase-admin';
import * as forge from 'node-forge';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export interface CertificadoInfo {
  key: forge.pki.PrivateKey;
  cert: forge.pki.Certificate;
  keyPem: string;
  certPem: string;
  chain: forge.pki.Certificate[];
}

export async function carregarCertificado(
  storagePath: string,
  senha: string,
): Promise<CertificadoInfo> {
  const bucket = admin.storage().bucket('consultorfiscalapp.firebasestorage.app');
  const file = bucket.file(storagePath);

  const [exists] = await file.exists();
  if (!exists) throw new Error(`Certificado não encontrado: ${storagePath}`);

  const [buffer] = await file.download();

  const p12Asn1 = forge.asn1.fromDer(buffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  const certBag = certBags[forge.pki.oids.certBag];

  if (!keyBag || keyBag.length === 0 || !keyBag[0].key) {
    throw new Error('Chave privada não encontrada no certificado');
  }
  if (!certBag || certBag.length === 0 || !certBag[0].cert) {
    throw new Error('Certificado não encontrado no arquivo .pfx');
  }

  const key = keyBag[0].key;
  const cert = certBag[0].cert;
  const chain = certBag.slice(1).filter(b => b.cert).map(b => b.cert!);

  return {
    key,
    cert,
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(cert),
    chain,
  };
}

async function buscarSenhaSecretManager(cnpj: string): Promise<string | null> {
  try {
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'consultorfiscalapp';
    const secretName = `projects/${projectId}/secrets/cert-senha-${cnpj.replace(/\D/g, '')}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name: secretName });
    const payload = version.payload?.data;
    if (payload) {
      return typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8');
    }
  } catch {}
  return null;
}

function buscarSenhaEnvVar(cnpj: string): string | null {
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  return process.env[`CERT_SENHA_${cnpjLimpo}`] || null;
}

export function extrairInfoCertificado(cert: forge.pki.Certificate) {
  const subject = cert.subject.attributes.reduce((acc: any, attr: any) => {
    acc[attr.shortName || attr.name] = attr.value;
    return acc;
  }, {});

  return {
    cn: subject.CN || '',
    o: subject.O || '',
    cpfCnpj: subject.CN?.match(/\d{11,14}/)?.[0] || '',
    validoAte: cert.validity.notAfter.toISOString(),
    validoDe: cert.validity.notBefore.toISOString(),
    emissor: cert.issuer.attributes.find((a: any) => a.shortName === 'CN')?.value || '',
  };
}

export async function buscarSenhaCertificado(cnpj: string): Promise<string> {
  // 1. Secret Manager (most secure)
  const smSenha = await buscarSenhaSecretManager(cnpj);
  if (smSenha) return smSenha;

  // 2. Environment variable fallback
  const envSenha = buscarSenhaEnvVar(cnpj);
  if (envSenha) return envSenha;

  // 3. Firestore fallback
  const db = admin.firestore();
  const colecoes = ['certificados', 'empresas_certificados', 'certificates', 'certs'];

  for (const col of colecoes) {
    try {
      const snap = await db.collection(col).where('cnpj', '==', cnpj).limit(1).get();
      if (!snap.empty) {
        const data = snap.docs[0].data();
        return data.senha || data.password || data.pin || '';
      }
      const snap2 = await db.collection(col).where('CNPJ', '==', cnpj).limit(1).get();
      if (!snap2.empty) {
        const data = snap2.docs[0].data();
        return data.senha || data.password || data.pin || '';
      }
    } catch {}
  }

  throw new Error(`Senha do certificado não encontrada para CNPJ ${cnpj}`);
}
