-- Permit only the local application role to mutate the CMS state and append history.
GRANT SELECT, INSERT, UPDATE ON sst.site_cms_state TO sst_hoje_app;
GRANT SELECT, INSERT ON sst.site_cms_history TO sst_hoje_app;
