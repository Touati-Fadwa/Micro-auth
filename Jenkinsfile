pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

       stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp $KUBECONFIG_FILE ~/.kube/config
              sed -i 's/127.0.0.1/192.168.1.114/g' ~/.kube/config
              chmod 600 ~/.kube/config
              
              # Test connection
              kubectl get nodes
              kubectl cluster-info
              kubectl get componentstatuses
              
              # Create namespace if not exists
              if ! kubectl get namespace $KUBE_NAMESPACE >/dev/null 2>&1; then
                kubectl create namespace $KUBE_NAMESPACE
              fi
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              kubectl config set-context --current --namespace=$KUBE_NAMESPACE
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
              kubectl apply -f k8s/bibliotheque-auth-service.yaml
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              # Verify deployment status
              kubectl wait --for=condition=available \
                --timeout=300s \
                deployment/bibliotheque-auth \
                -n $KUBE_NAMESPACE
              
              # Display deployment information
              echo "=== Deployment Status ==="
              kubectl get deploy -n $KUBE_NAMESPACE
              
              echo "=== Service Details ==="
              kubectl get svc -n $KUBE_NAMESPACE
              
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
              
              # Generate access URL
              echo "Application accessible via:"
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "http://$NODE_IP:$NODE_PORT"
            '''
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            echo "!!! Deployment failed - Initiating rollback !!!"
            kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE
            kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=120s
            echo "Rollback to previous version completed"
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}