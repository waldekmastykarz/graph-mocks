# Microsoft Graph mocks for Microsoft 365 Developer Proxy

This repo contains Microsoft Graph mocks for [Microsoft 365 Developer Proxy](https://aka.ms/m365/proxy). Using these mocks, you can simulate calling Microsoft Graph endpoints from your application, without actually calling Microsoft Graph.

You'll find these mocks helpful if you want:

- predictable data
- quickly prototype an app without setting up auth
- Microsoft Graph responses without creating the necessary objects behind them

## Mock files

Mock files in this repo are built using the sample requests and responses from the [Microsoft Graph API reference documentation](https://learn.microsoft.com/graph/api/overview?view=graph-rest-1.0).

File|Description
----|-----------
[graph-v1_0-proxy-mocks.json](./graph-v1_0-proxy-mocks.json)|mock responses for endpoints that are a part of Microsoft Graph v1.0
[graph-beta-proxy-mocks.json](./graph-beta-proxy-mocks.json)|mock responses for endpoints that are a part of Microsoft Graph beta
[graph-v1_0-proxy-mocks-sandbox.json](./graph-v1_0-proxy-mocks-sandbox.json)|mock responses for endpoints that are a part of Microsoft Graph v1.0. Where possible, uses the same data as [Microsoft Graph Explorer](https://aka.ms/ge)
[graph-beta-proxy-mocks-sandbox.json](./graph-beta-proxy-mocks-sandbox.json)|mock responses for endpoints that are a part of Microsoft Graph beta. Where possible, uses the same data as [Microsoft Graph Explorer](https://aka.ms/ge)

## Use the mock files

To use any of the mock files, download the file, and then start the Microsoft 365 Developer Proxy passing the path to the downloaded mock file, eg.

```sh
m365proxy --mocks-file ./graph-v1_0-proxy-mocks-sandbox.json
```

When you call a Microsoft Graph endpoint, that's covered by one of the mocks, Microsoft 365 Developer Proxy, will send the corresponding mock response to your application.

## More information

- [Microsoft 365 Developer Proxy](https://aka.ms/m365/proxy)
- [Mock responses using Microsoft 365 Developer Proxy](https://github.com/microsoft/m365-developer-proxy/wiki/Mock-responses)
