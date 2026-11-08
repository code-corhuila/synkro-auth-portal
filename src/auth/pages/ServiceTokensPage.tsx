import { IssueServiceTokenForm } from '../components/IssueServiceTokenForm';
import { ServiceTokenLookup } from '../components/ServiceTokenLookup';
import type { Owner } from '../intent/registrationIntent';
import './ServiceTokensPage.css';

export function ServiceTokensPage({ owner }: { owner: Owner }) {
  return (
    <div className="service-tokens-page">
      <h1 className="service-tokens-page__title">Tokens de servicio</h1>
      <IssueServiceTokenForm owner={owner} />
      <ServiceTokenLookup />
    </div>
  );
}
