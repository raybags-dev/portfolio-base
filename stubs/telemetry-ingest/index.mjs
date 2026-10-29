// Placeholder handler so `terraform apply` succeeds before real builds exist.
// Replace via lambda_source_dirs in terraform.tfvars (point at aws/dist/*).
export const handler = async (event) => {
  console.log("stub invoked", JSON.stringify(event).slice(0, 400));
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ success: true, data: { stub: true } }) };
};
