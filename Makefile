# Convenience wrapper around terraform (binary lives in ./tools if you used
# scripts/tf.sh to fetch it). `make down` destroys everything the stack made.
TF := $(shell command -v terraform 2>/dev/null || echo ./tools/terraform)

.PHONY: help init validate fmt plan up down output build-handlers

help:
	@echo "make build-handlers  - npm ci + build the aws/ lambda handlers"
	@echo "make init            - terraform init"
	@echo "make validate        - fmt check + validate"
	@echo "make plan            - terraform plan"
	@echo "make up              - build handlers + terraform apply"
	@echo "make down            - terraform destroy (teardown after sessions!)"
	@echo "make output          - terraform output (incl. sensitive broker key)"

build-handlers:
	cd aws && npm ci && npm run build

init:
	$(TF) init

validate: init
	$(TF) fmt -check -recursive
	$(TF) validate

fmt:
	$(TF) fmt -recursive

plan: init
	$(TF) plan

up: build-handlers init
	$(TF) apply

down:
	$(TF) destroy

output:
	$(TF) output
	@echo
	@echo "Broker secret (store in admin panel):"
	@$(TF) output -raw platform_broker_secret 2>/dev/null || echo "(not deployed)"
