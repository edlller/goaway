import { Button } from "@/components/ui/button";
import { SettingRow } from "./SettingsRow";

export const SecuritySection = ({
  onApiKeyClick
}: {
  onApiKeyClick: () => void;
}) => (
  <>
    <SettingRow
      title="API Keys"
      description="Manage programmatic access keys."
      action={
        <Button variant="outline" onClick={onApiKeyClick}>
          Manage Keys
        </Button>
      }
    />
  </>
);
