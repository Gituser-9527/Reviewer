# Provider verification guide

Create an encrypted tenant connection, set it active/default after verification, then invoke its verify endpoint. The probe requests only `{"ok":true}` and records safe aggregate metadata; never put real job text in a smoke probe.
